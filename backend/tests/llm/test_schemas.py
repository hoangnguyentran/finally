"""Structured-output schema validation."""

import pytest
from pydantic import ValidationError

from app.llm import ChatLLMResponse, TradeAction, WatchlistChange


def test_message_only_response_defaults_to_no_actions():
    response = ChatLLMResponse.model_validate_json('{"message": "Hello"}')
    assert response.message == "Hello"
    assert response.trades == []
    assert response.watchlist_changes == []


def test_full_response_parses_actions():
    raw = """{
        "message": "Buying Apple.",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
        "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]
    }"""
    response = ChatLLMResponse.model_validate_json(raw)

    assert response.trades == [TradeAction(ticker="AAPL", side="buy", quantity=10.0)]
    assert response.watchlist_changes == [WatchlistChange(ticker="PYPL", action="add")]


def test_default_action_lists_are_not_shared_between_instances():
    first = ChatLLMResponse(message="a")
    first.trades.append(TradeAction(ticker="AAPL", side="buy", quantity=1))
    assert ChatLLMResponse(message="b").trades == []


def test_missing_message_is_rejected():
    with pytest.raises(ValidationError):
        ChatLLMResponse.model_validate_json('{"trades": []}')


@pytest.mark.parametrize(
    "raw",
    [
        '{"message": "x", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}]}',
        '{"message": "x", "trades": [{"ticker": "AAPL", "side": "buy"}]}',
        '{"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "star"}]}',
    ],
)
def test_malformed_actions_are_rejected(raw):
    with pytest.raises(ValidationError):
        ChatLLMResponse.model_validate_json(raw)
