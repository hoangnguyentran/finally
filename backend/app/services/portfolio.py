"""Portfolio business logic: valuation, trade validation, and watchlist management.

This layer sits between the database (pure CRUD) and the transport layers (REST
routes, LLM chat). It is deliberately free of FastAPI types so the chat module can
call it directly.
"""

from __future__ import annotations

import logging
import math

from app import db
from app.market import MarketDataSource, PriceCache

logger = logging.getLogger(__name__)

VALID_SIDES = ("buy", "sell")


class TradeError(Exception):
    """A trade failed validation. `message` is safe to show the user."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PortfolioService:
    """Portfolio valuation and trading for the single hardcoded user."""

    def __init__(self, price_cache: PriceCache, market_source: MarketDataSource) -> None:
        self._prices = price_cache
        self._market = market_source

    # --- Valuation --------------------------------------------------------

    def get_portfolio(self) -> dict:
        """Cash, priced positions with unrealized P&L, and total portfolio value."""
        cash_balance = db.get_user_profile()["cash_balance"]
        positions = [self._price_position(row) for row in db.list_positions()]
        positions_value = math.fsum(position["market_value"] for position in positions)
        cost_basis = math.fsum(position["cost_basis"] for position in positions)

        return {
            "cash_balance": round(cash_balance, 2),
            "positions": positions,
            "positions_value": round(positions_value, 2),
            "total_value": round(cash_balance + positions_value, 2),
            "unrealized_pnl": round(positions_value - cost_basis, 2),
            "unrealized_pnl_percent": _percent_change(cost_basis, positions_value),
        }

    def _price_position(self, position: dict) -> dict:
        """Attach the live price and P&L to a stored position row."""
        ticker = position["ticker"]
        quantity = position["quantity"]
        avg_cost = position["avg_cost"]
        # Fall back to cost basis for a ticker with no price yet, so an unpriced
        # position values at break-even rather than zero.
        current_price = self._prices.get_price(ticker) or avg_cost

        market_value = quantity * current_price
        cost_basis = quantity * avg_cost

        return {
            "ticker": ticker,
            "quantity": quantity,
            "avg_cost": round(avg_cost, 4),
            "current_price": current_price,
            "market_value": round(market_value, 2),
            "cost_basis": round(cost_basis, 2),
            "unrealized_pnl": round(market_value - cost_basis, 2),
            "unrealized_pnl_percent": _percent_change(cost_basis, market_value),
            "updated_at": position["updated_at"],
        }

    def get_portfolio_history(self) -> list[dict]:
        """Total-value snapshots over time, oldest first, for the P&L chart."""
        return db.list_portfolio_snapshots()

    # --- Trading ----------------------------------------------------------

    def execute_trade(self, ticker: str, side: str, quantity: float) -> dict:
        """Validate and execute a market order at the current price.

        Raises TradeError with a user-facing message on any validation failure.
        """
        ticker = ticker.strip().upper()
        side = side.strip().lower()

        if side not in VALID_SIDES:
            raise TradeError(f"Invalid side '{side}' — must be 'buy' or 'sell'.")
        if quantity <= 0:
            raise TradeError("Quantity must be greater than zero.")

        price = self._prices.get_price(ticker)
        if price is None:
            raise TradeError(f"No current price available for {ticker}.")

        cash_balance = db.get_user_profile()["cash_balance"]
        position = db.get_position(ticker)

        if side == "buy":
            new_cash, new_quantity, new_avg_cost = _apply_buy(
                cash_balance, position, quantity, price
            )
        else:
            new_cash, new_quantity, new_avg_cost = _apply_sell(
                cash_balance, position, quantity, price, ticker
            )

        trade = db.execute_trade(
            ticker=ticker,
            side=side,
            quantity=quantity,
            price=price,
            new_cash_balance=new_cash,
            new_quantity=new_quantity,
            new_avg_cost=new_avg_cost,
        )
        db.record_portfolio_snapshot(self.get_portfolio()["total_value"])
        logger.info("Executed %s %s x%s @ %s", side, ticker, quantity, price)
        return trade

    # --- Watchlist --------------------------------------------------------

    def get_watchlist(self) -> list[dict]:
        """Watchlist tickers merged with their latest cached price data."""
        entries = []
        for ticker in db.list_watchlist():
            update = self._prices.get(ticker)
            entry = {"ticker": ticker}
            if update is not None:
                entry.update(update.to_dict())
            entries.append(entry)
        return entries

    async def add_watchlist_ticker(self, ticker: str) -> None:
        """Persist a watchlist addition and start streaming prices for it."""
        ticker = ticker.strip().upper()
        if not ticker:
            raise TradeError("Ticker must not be empty.")
        db.add_watchlist_ticker(ticker)
        await self._market.add_ticker(ticker)

    async def remove_watchlist_ticker(self, ticker: str) -> None:
        """Remove a watchlist entry and stop streaming prices for it."""
        ticker = ticker.strip().upper()
        db.remove_watchlist_ticker(ticker)
        await self._market.remove_ticker(ticker)


def _apply_buy(
    cash_balance: float,
    position: dict | None,
    quantity: float,
    price: float,
) -> tuple[float, float, float]:
    """New (cash, quantity, avg_cost) after a buy. Average cost is share-weighted."""
    cost = quantity * price
    if cost > cash_balance:
        raise TradeError(
            f"Insufficient cash: trade costs ${cost:,.2f} "
            f"but only ${cash_balance:,.2f} is available."
        )

    held_quantity = position["quantity"] if position else 0.0
    held_cost = held_quantity * position["avg_cost"] if position else 0.0
    new_quantity = held_quantity + quantity

    return round(cash_balance - cost, 2), new_quantity, (held_cost + cost) / new_quantity


def _apply_sell(
    cash_balance: float,
    position: dict | None,
    quantity: float,
    price: float,
    ticker: str,
) -> tuple[float, float, float]:
    """New (cash, quantity, avg_cost) after a sell. Average cost is unchanged."""
    held_quantity = position["quantity"] if position else 0.0
    if quantity > held_quantity:
        raise TradeError(
            f"Insufficient shares: cannot sell {quantity:g} {ticker}, you hold {held_quantity:g}."
        )

    avg_cost = position["avg_cost"] if position else 0.0
    return round(cash_balance + quantity * price, 2), held_quantity - quantity, avg_cost


def _percent_change(basis: float, value: float) -> float:
    return round((value - basis) / basis * 100, 2) if basis else 0.0
