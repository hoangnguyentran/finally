"""End-to-end chat turns through the mock LLM path: auto-execution and persistence."""

import pytest

from app import db
from app.llm import handle_chat_message


async def test_plain_message_returns_portfolio_value_and_no_actions(service):
    result = await handle_chat_message(service, "how is my portfolio doing?")

    assert "$10,000.00" in result["message"]
    assert result["trades"] == []
    assert result["watchlist_changes"] == []


async def test_buy_message_executes_the_trade(service):
    result = await handle_chat_message(service, "buy 5 AAPL")

    trade = result["trades"][0]
    assert trade["status"] == "executed"
    assert (trade["ticker"], trade["side"], trade["quantity"]) == ("AAPL", "buy", 5.0)
    assert trade["error"] is None
    assert trade["price"] == 100.0
    assert trade["detail"]["price"] == 100.0

    assert db.get_position("AAPL")["quantity"] == 5.0
    assert db.get_user_profile()["cash_balance"] == 9500.0


async def test_sell_message_executes_the_trade(service):
    await handle_chat_message(service, "buy 5 AAPL")
    result = await handle_chat_message(service, "sell 2 AAPL")

    assert result["trades"][0]["status"] == "executed"
    assert db.get_position("AAPL")["quantity"] == 3.0


async def test_watchlist_add_message_adds_the_ticker(service, market_source):
    result = await handle_chat_message(service, "add PYPL to my watchlist")

    change = result["watchlist_changes"][0]
    assert (change["ticker"], change["action"], change["status"]) == ("PYPL", "add", "executed")
    assert change["error"] is None
    assert "PYPL" in db.list_watchlist()
    assert "PYPL" in market_source.get_tickers()


async def test_watchlist_remove_message_removes_the_ticker(service, market_source):
    await handle_chat_message(service, "add PYPL to my watchlist")
    result = await handle_chat_message(service, "remove PYPL from my watchlist")

    assert result["watchlist_changes"][0]["action"] == "remove"
    assert result["watchlist_changes"][0]["status"] == "executed"
    assert "PYPL" not in db.list_watchlist()


async def test_unaffordable_buy_is_reported_not_raised(service):
    result = await handle_chat_message(service, "buy 5000 AAPL")

    trade = result["trades"][0]
    assert trade["status"] == "failed"
    assert trade["price"] is None
    assert trade["detail"] is None
    assert "Insufficient cash" in trade["error"]
    assert db.get_position("AAPL") is None
    assert db.get_user_profile()["cash_balance"] == 10000.0


async def test_oversized_sell_is_reported_not_raised(service):
    result = await handle_chat_message(service, "sell 10 AAPL")

    trade = result["trades"][0]
    assert trade["status"] == "failed"
    assert "Insufficient shares" in trade["error"]


async def test_failed_action_still_persists_the_conversation(service):
    await handle_chat_message(service, "buy 5000 AAPL")

    messages = db.list_chat_messages()
    assert messages[-1]["actions"]["trades"][0]["status"] == "failed"


async def test_chat_turn_persists_user_then_assistant_message(service):
    await handle_chat_message(service, "buy 5 AAPL")
    messages = db.list_chat_messages()

    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "buy 5 AAPL"
    assert messages[0]["actions"] is None
    assert "AAPL" in messages[1]["content"]
    assert messages[1]["actions"]["trades"][0]["status"] == "executed"
    assert messages[1]["actions"]["watchlist_changes"] == []


async def test_history_accumulates_across_turns(service):
    await handle_chat_message(service, "hello")
    await handle_chat_message(service, "hello again")

    assert len(db.list_chat_messages()) == 4


@pytest.mark.parametrize("message", ["buy 5 AAPL", "add PYPL to my watchlist", "hi there"])
async def test_response_payload_shape(service, message):
    result = await handle_chat_message(service, message)

    assert set(result) == {"message", "trades", "watchlist_changes"}
    assert isinstance(result["message"], str) and result["message"]
    for trade in result["trades"]:
        assert set(trade) == {"ticker", "side", "quantity", "status", "price", "detail", "error"}
    for change in result["watchlist_changes"]:
        assert set(change) == {"ticker", "action", "status", "error"}


async def test_mock_path_never_calls_the_llm(service, monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("LLM_MOCK=true must not reach the network")

    monkeypatch.setattr("app.llm.chat.completion", explode)
    await handle_chat_message(service, "buy 5 AAPL")
