"""Deterministic stand-in for the LLM, used when LLM_MOCK=true (PLAN.md sections 5 and 12).

Recognised phrasings, checked in this order — the first match wins:

| Trigger                                          | Result                        |
|--------------------------------------------------|-------------------------------|
| "buy" + quantity + TICKER  ("buy 5 AAPL")         | one `buy` trade               |
| "sell" + quantity + TICKER ("sell 2 TSLA")        | one `sell` trade              |
| "remove"/"unwatch" + TICKER ("remove NFLX")       | watchlist `remove`            |
| "watch"/"add" + TICKER     ("add PYPL to watch")  | watchlist `add`               |
| anything else                                     | portfolio-value reply, no-op  |

A ticker is any standalone run of 1-5 uppercase letters that is not a keyword, so
tickers must be written in caps. Trades need an explicit number; without one the
message falls through to the watchlist or conversational branches.
"""

from __future__ import annotations

import os
import re

from .schemas import ChatLLMResponse, TradeAction, WatchlistChange

TICKER_PATTERN = re.compile(r"\b[A-Z]{1,5}\b")
QUANTITY_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\b")

# Uppercase words that read like tickers but are part of the instruction.
NON_TICKER_WORDS = frozenset(
    {
        "A", "ADD", "ALL", "AND", "ANY", "AT", "BUY", "DO", "FOR", "FROM", "I", "IF",
        "IN", "IS", "IT", "LIST", "ME", "MY", "OF", "ON", "OR", "PLS", "TO", "REMOVE",
        "SELL", "SOME", "THE", "USD", "WATCH", "YOU",
    }
)


def is_mock_enabled() -> bool:
    """True when LLM_MOCK is set to "true" (case-insensitive)."""
    return os.environ.get("LLM_MOCK", "").strip().lower() == "true"


def build_mock_response(user_message: str, portfolio: dict) -> ChatLLMResponse:
    """Derive a ChatLLMResponse from the user's message by pattern matching."""
    lowered = user_message.lower()
    ticker = _first_ticker(user_message)
    quantity = _first_quantity(user_message)

    if ticker and quantity is not None and ("buy" in lowered or "sell" in lowered):
        side = "sell" if "sell" in lowered else "buy"
        verb = "Selling" if side == "sell" else "Buying"
        return ChatLLMResponse(
            message=f"{verb} {quantity:g} {ticker} at the current market price.",
            trades=[TradeAction(ticker=ticker, side=side, quantity=quantity)],
        )

    if ticker and ("remove" in lowered or "unwatch" in lowered):
        return ChatLLMResponse(
            message=f"Removing {ticker} from your watchlist.",
            watchlist_changes=[WatchlistChange(ticker=ticker, action="remove")],
        )

    if ticker and ("watch" in lowered or "add" in lowered):
        return ChatLLMResponse(
            message=f"Adding {ticker} to your watchlist.",
            watchlist_changes=[WatchlistChange(ticker=ticker, action="add")],
        )

    return ChatLLMResponse(
        message=f"Your portfolio is currently worth ${portfolio['total_value']:,.2f}."
    )


def _first_ticker(message: str) -> str | None:
    return next(
        (word for word in TICKER_PATTERN.findall(message) if word not in NON_TICKER_WORDS),
        None,
    )


def _first_quantity(message: str) -> float | None:
    match = QUANTITY_PATTERN.search(message)
    return float(match.group()) if match else None
