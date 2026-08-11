"""Tests for PortfolioService: valuation, trade validation, watchlist."""

import pytest

from app import db
from app.services import TradeError


class TestGetPortfolio:
    def test_empty_portfolio_is_all_cash(self, service):
        portfolio = service.get_portfolio()

        assert portfolio["cash_balance"] == 10000.0
        assert portfolio["positions"] == []
        assert portfolio["total_value"] == 10000.0
        assert portfolio["unrealized_pnl"] == 0.0

    def test_position_priced_from_cache(self, service, price_cache):
        db.upsert_position("AAPL", quantity=10, avg_cost=90.0)
        price_cache.update("AAPL", 100.0)

        position = service.get_portfolio()["positions"][0]

        assert position["ticker"] == "AAPL"
        assert position["current_price"] == 100.0
        assert position["market_value"] == 1000.0
        assert position["cost_basis"] == 900.0
        assert position["unrealized_pnl"] == 100.0
        assert position["unrealized_pnl_percent"] == pytest.approx(11.11)

    def test_total_value_sums_cash_and_positions(self, service):
        db.set_cash_balance(5000.0)
        db.upsert_position("AAPL", quantity=10, avg_cost=90.0)
        db.upsert_position("GOOGL", quantity=2, avg_cost=210.0)

        portfolio = service.get_portfolio()

        assert portfolio["positions_value"] == 1400.0
        assert portfolio["total_value"] == 6400.0
        # AAPL +100, GOOGL -20
        assert portfolio["unrealized_pnl"] == 80.0

    def test_losing_position_reports_negative_pnl(self, service, price_cache):
        price_cache.update("AAPL", 80.0)
        db.upsert_position("AAPL", quantity=10, avg_cost=90.0)

        position = service.get_portfolio()["positions"][0]

        assert position["unrealized_pnl"] == -100.0
        assert position["unrealized_pnl_percent"] == pytest.approx(-11.11)

    def test_unpriced_position_values_at_cost(self, service):
        db.upsert_position("ZZZZ", quantity=5, avg_cost=20.0)

        position = service.get_portfolio()["positions"][0]

        assert position["current_price"] == 20.0
        assert position["unrealized_pnl"] == 0.0


class TestBuy:
    def test_buy_deducts_cash_and_opens_position(self, service):
        trade = service.execute_trade("AAPL", "buy", 10)

        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "buy"
        assert trade["price"] == 100.0
        assert db.get_user_profile()["cash_balance"] == 9000.0
        position = db.get_position("AAPL")
        assert (position["quantity"], position["avg_cost"]) == (10, 100.0)

    def test_second_buy_weights_average_cost(self, service, price_cache):
        service.execute_trade("AAPL", "buy", 10)  # @ 100
        price_cache.update("AAPL", 200.0)
        service.execute_trade("AAPL", "buy", 10)  # @ 200

        position = db.get_position("AAPL")
        assert position["quantity"] == 20
        assert position["avg_cost"] == pytest.approx(150.0)

    def test_insufficient_cash_rejected(self, service):
        with pytest.raises(TradeError, match="Insufficient cash"):
            service.execute_trade("AAPL", "buy", 101)

        assert db.get_user_profile()["cash_balance"] == 10000.0
        assert db.get_position("AAPL") is None

    def test_buy_spending_entire_balance_is_allowed(self, service):
        service.execute_trade("AAPL", "buy", 100)

        assert db.get_user_profile()["cash_balance"] == 0.0

    def test_fractional_shares_supported(self, service):
        service.execute_trade("AAPL", "buy", 2.5)

        assert db.get_position("AAPL")["quantity"] == 2.5
        assert db.get_user_profile()["cash_balance"] == 9750.0

    def test_lowercase_ticker_is_normalized(self, service):
        service.execute_trade("aapl", "BUY", 1)

        assert db.get_position("AAPL")["quantity"] == 1


class TestSell:
    def test_sell_adds_cash_and_reduces_quantity(self, service, price_cache):
        service.execute_trade("AAPL", "buy", 10)
        price_cache.update("AAPL", 120.0)

        service.execute_trade("AAPL", "sell", 4)

        position = db.get_position("AAPL")
        assert position["quantity"] == 6
        assert position["avg_cost"] == 100.0  # unchanged by a sell
        assert db.get_user_profile()["cash_balance"] == 9480.0

    def test_selling_everything_closes_the_position(self, service):
        service.execute_trade("AAPL", "buy", 10)
        service.execute_trade("AAPL", "sell", 10)

        assert db.get_position("AAPL") is None
        assert db.get_user_profile()["cash_balance"] == 10000.0

    def test_selling_more_than_owned_rejected(self, service):
        service.execute_trade("AAPL", "buy", 5)

        with pytest.raises(TradeError, match="Insufficient shares"):
            service.execute_trade("AAPL", "sell", 6)

        assert db.get_position("AAPL")["quantity"] == 5

    def test_selling_unowned_ticker_rejected(self, service):
        with pytest.raises(TradeError, match="Insufficient shares"):
            service.execute_trade("GOOGL", "sell", 1)

    def test_sell_at_a_loss_realizes_less_cash(self, service, price_cache):
        service.execute_trade("AAPL", "buy", 10)
        price_cache.update("AAPL", 50.0)

        service.execute_trade("AAPL", "sell", 10)

        assert db.get_user_profile()["cash_balance"] == 9500.0


class TestTradeValidation:
    def test_unknown_ticker_rejected(self, service):
        with pytest.raises(TradeError, match="No current price"):
            service.execute_trade("ZZZZ", "buy", 1)

    def test_invalid_side_rejected(self, service):
        with pytest.raises(TradeError, match="Invalid side"):
            service.execute_trade("AAPL", "short", 1)

    @pytest.mark.parametrize("quantity", [0, -5])
    def test_non_positive_quantity_rejected(self, service, quantity):
        with pytest.raises(TradeError, match="greater than zero"):
            service.execute_trade("AAPL", "buy", quantity)


class TestTradeSideEffects:
    def test_trade_is_logged(self, service):
        service.execute_trade("AAPL", "buy", 3)

        trades = db.list_trades()
        assert len(trades) == 1
        assert (trades[0]["side"], trades[0]["quantity"]) == ("buy", 3)

    def test_snapshot_recorded_after_each_trade(self, service):
        service.execute_trade("AAPL", "buy", 3)
        service.execute_trade("AAPL", "sell", 1)

        snapshots = db.list_portfolio_snapshots()
        assert len(snapshots) == 2
        assert snapshots[-1]["total_value"] == 10000.0

    def test_failed_trade_records_nothing(self, service):
        with pytest.raises(TradeError):
            service.execute_trade("AAPL", "buy", 1000)

        assert db.list_trades() == []
        assert db.list_portfolio_snapshots() == []


class TestWatchlist:
    def test_seeded_watchlist_merges_prices(self, service):
        entries = service.get_watchlist()

        assert [entry["ticker"] for entry in entries] == db.list_watchlist()
        aapl = next(entry for entry in entries if entry["ticker"] == "AAPL")
        assert aapl["price"] == 100.0
        assert aapl["direction"] == "flat"

    def test_unpriced_ticker_has_ticker_only(self, service):
        db.add_watchlist_ticker("ZZZZ")

        entry = next(e for e in service.get_watchlist() if e["ticker"] == "ZZZZ")
        assert entry == {"ticker": "ZZZZ"}

    async def test_add_persists_and_subscribes(self, service, market_source):
        await service.add_watchlist_ticker("pypl")

        assert "PYPL" in db.list_watchlist()
        assert "PYPL" in market_source.get_tickers()

    async def test_remove_unsubscribes(self, service, market_source, price_cache):
        await service.add_watchlist_ticker("PYPL")
        await service.remove_watchlist_ticker("PYPL")

        assert "PYPL" not in db.list_watchlist()
        assert "PYPL" not in market_source.get_tickers()
        assert price_cache.get("PYPL") is None

    async def test_empty_ticker_rejected(self, service):
        with pytest.raises(TradeError):
            await service.add_watchlist_ticker("   ")


class TestHistory:
    def test_history_is_oldest_first(self, service):
        db.record_portfolio_snapshot(10000.0)
        db.record_portfolio_snapshot(10500.0)

        history = service.get_portfolio_history()
        assert [snapshot["total_value"] for snapshot in history] == [10000.0, 10500.0]
