"""Tests for the REST API: status codes, response shapes, error handling."""

from fastapi.testclient import TestClient

from app import db
from app.main import app as main_app


class TestPortfolioRoutes:
    def test_get_portfolio_shape(self, client):
        response = client.get("/api/portfolio")

        assert response.status_code == 200
        body = response.json()
        assert body["cash_balance"] == 10000.0
        assert body["total_value"] == 10000.0
        assert body["positions"] == []

    def test_get_portfolio_includes_priced_positions(self, client):
        db.upsert_position("AAPL", quantity=10, avg_cost=90.0)

        position = client.get("/api/portfolio").json()["positions"][0]

        assert position["ticker"] == "AAPL"
        assert position["current_price"] == 100.0
        assert position["unrealized_pnl"] == 100.0

    def test_trade_returns_the_executed_trade(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 5, "side": "buy"}
        )

        assert response.status_code == 200
        trade = response.json()
        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "buy"
        assert trade["quantity"] == 5
        assert trade["price"] == 100.0
        assert client.get("/api/portfolio").json()["cash_balance"] == 9500.0

    def test_insufficient_cash_returns_400(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 500, "side": "buy"}
        )

        assert response.status_code == 400
        assert "Insufficient cash" in response.json()["detail"]

    def test_insufficient_shares_returns_400(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "sell"}
        )

        assert response.status_code == 400
        assert "Insufficient shares" in response.json()["detail"]

    def test_unknown_ticker_returns_400(self, client):
        response = client.post(
            "/api/portfolio/trade", json={"ticker": "ZZZZ", "quantity": 1, "side": "buy"}
        )

        assert response.status_code == 400
        assert "No current price" in response.json()["detail"]

    def test_malformed_body_returns_422(self, client):
        response = client.post("/api/portfolio/trade", json={"ticker": "AAPL"})

        assert response.status_code == 422

    def test_history_starts_empty_and_grows_with_trades(self, client):
        assert client.get("/api/portfolio/history").json() == []

        client.post(
            "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"}
        )

        history = client.get("/api/portfolio/history").json()
        assert len(history) == 1
        assert history[0]["total_value"] == 10000.0


class TestWatchlistRoutes:
    def test_get_watchlist_returns_seeded_tickers(self, client):
        response = client.get("/api/watchlist")

        assert response.status_code == 200
        entries = response.json()
        assert [entry["ticker"] for entry in entries] == list(db.DEFAULT_WATCHLIST)
        aapl = next(entry for entry in entries if entry["ticker"] == "AAPL")
        assert aapl["price"] == 100.0

    def test_add_ticker_returns_updated_watchlist(self, client, market_source):
        response = client.post("/api/watchlist", json={"ticker": "pypl"})

        assert response.status_code == 200
        assert "PYPL" in [entry["ticker"] for entry in response.json()]
        assert "PYPL" in market_source.get_tickers()

    def test_add_existing_ticker_is_idempotent(self, client):
        client.post("/api/watchlist", json={"ticker": "AAPL"})

        tickers = [entry["ticker"] for entry in client.get("/api/watchlist").json()]
        assert tickers.count("AAPL") == 1

    def test_empty_ticker_returns_422(self, client):
        assert client.post("/api/watchlist", json={"ticker": ""}).status_code == 422

    def test_delete_ticker_returns_updated_watchlist(self, client, price_cache):
        response = client.delete("/api/watchlist/AAPL")

        assert response.status_code == 200
        assert "AAPL" not in [entry["ticker"] for entry in response.json()]
        assert price_cache.get("AAPL") is None

    def test_delete_unknown_ticker_is_a_no_op(self, client):
        assert client.delete("/api/watchlist/ZZZZ").status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        # No context manager: the lifespan (and the live market feed) stays unstarted.
        assert TestClient(main_app).get("/api/health").json() == {"status": "ok"}
