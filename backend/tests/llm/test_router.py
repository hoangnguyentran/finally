"""POST /api/chat via TestClient, always in mock mode."""

import pytest

from app import db
from app.llm.chat import ChatError


def test_plain_message_returns_a_reply(client):
    response = client.post("/api/chat", json={"message": "how am I doing?"})

    assert response.status_code == 200
    body = response.json()
    assert body["message"]
    assert body["trades"] == []
    assert body["watchlist_changes"] == []


def test_buy_message_executes_and_reports_the_trade(client):
    response = client.post("/api/chat", json={"message": "buy 5 AAPL"})

    assert response.status_code == 200
    trade = response.json()["trades"][0]
    assert (trade["ticker"], trade["side"], trade["quantity"]) == ("AAPL", "buy", 5.0)
    assert trade["status"] == "executed"
    assert trade["price"] == 100.0
    assert db.get_position("AAPL")["quantity"] == 5.0


def test_watchlist_change_is_applied(client):
    response = client.post("/api/chat", json={"message": "add PYPL to my watchlist"})

    assert response.status_code == 200
    assert response.json()["watchlist_changes"][0]["status"] == "executed"
    assert "PYPL" in db.list_watchlist()


def test_failed_trade_returns_200_with_error_detail(client):
    response = client.post("/api/chat", json={"message": "buy 5000 AAPL"})

    assert response.status_code == 200
    trade = response.json()["trades"][0]
    assert trade["status"] == "failed"
    assert "Insufficient cash" in trade["error"]


@pytest.mark.parametrize("body", [{}, {"message": ""}, {"message": "   "}, {"message": None}])
def test_missing_or_blank_message_is_rejected(client, body):
    assert client.post("/api/chat", json=body).status_code == 422


def test_message_is_stripped_before_use(client):
    client.post("/api/chat", json={"message": "  buy 5 AAPL  "})
    assert db.list_chat_messages()[0]["content"] == "buy 5 AAPL"


def test_llm_failure_returns_502(client, monkeypatch):
    async def explode(*args, **kwargs):
        raise ChatError("The AI assistant is unavailable right now: boom")

    monkeypatch.setattr("app.llm.router.handle_chat_message", explode)
    response = client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"]
