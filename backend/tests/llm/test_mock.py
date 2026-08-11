"""Deterministic mock-mode pattern matching."""

import pytest

from app.llm.mock import build_mock_response, is_mock_enabled

PORTFOLIO = {"total_value": 10000.0}


@pytest.mark.parametrize(
    "value,expected",
    [("true", True), ("TRUE", True), (" true ", True), ("false", False), ("", False), ("1", False)],
)
def test_is_mock_enabled_reads_llm_mock(monkeypatch, value, expected):
    monkeypatch.setenv("LLM_MOCK", value)
    assert is_mock_enabled() is expected


def test_is_mock_enabled_defaults_to_false(monkeypatch):
    monkeypatch.delenv("LLM_MOCK", raising=False)
    assert is_mock_enabled() is False


@pytest.mark.parametrize(
    "message,ticker,quantity",
    [
        ("buy 5 AAPL", "AAPL", 5.0),
        ("Buy 10 shares of TSLA please", "TSLA", 10.0),
        ("I want to buy 2.5 NVDA", "NVDA", 2.5),
    ],
)
def test_buy_trigger(message, ticker, quantity):
    response = build_mock_response(message, PORTFOLIO)

    assert len(response.trades) == 1
    trade = response.trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == (ticker, "buy", quantity)
    assert response.watchlist_changes == []


@pytest.mark.parametrize(
    "message,ticker,quantity",
    [("sell 3 AAPL", "AAPL", 3.0), ("Sell 1 GOOGL now", "GOOGL", 1.0)],
)
def test_sell_trigger(message, ticker, quantity):
    response = build_mock_response(message, PORTFOLIO)

    assert len(response.trades) == 1
    trade = response.trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == (ticker, "sell", quantity)


@pytest.mark.parametrize(
    "message",
    ["add PYPL to my watchlist", "watch PYPL", "please add PYPL"],
)
def test_watchlist_add_trigger(message):
    response = build_mock_response(message, PORTFOLIO)

    assert response.trades == []
    assert len(response.watchlist_changes) == 1
    change = response.watchlist_changes[0]
    assert (change.ticker, change.action) == ("PYPL", "add")


@pytest.mark.parametrize(
    "message",
    ["remove NFLX from my watchlist", "unwatch NFLX"],
)
def test_watchlist_remove_trigger(message):
    response = build_mock_response(message, PORTFOLIO)

    assert len(response.watchlist_changes) == 1
    change = response.watchlist_changes[0]
    assert (change.ticker, change.action) == ("NFLX", "remove")


def test_remove_wins_over_add_when_both_words_appear():
    response = build_mock_response("remove NFLX that I added earlier", PORTFOLIO)
    assert response.watchlist_changes[0].action == "remove"


def test_conversational_fallback_reports_portfolio_value():
    response = build_mock_response("how am I doing?", {"total_value": 12345.67})

    assert response.trades == []
    assert response.watchlist_changes == []
    assert "$12,345.67" in response.message


def test_buy_without_a_quantity_is_conversational():
    response = build_mock_response("should I buy AAPL?", PORTFOLIO)
    assert response.trades == []


def test_lowercase_ticker_is_not_matched():
    response = build_mock_response("buy 5 aapl", PORTFOLIO)
    assert response.trades == []


def test_mock_response_is_deterministic():
    first = build_mock_response("buy 5 AAPL", PORTFOLIO)
    second = build_mock_response("buy 5 AAPL", PORTFOLIO)
    assert first == second
