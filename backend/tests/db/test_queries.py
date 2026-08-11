"""Tests for the data-access functions in app.db.queries."""

import pytest

from app.db import (
    DEFAULT_WATCHLIST,
    add_chat_message,
    add_watchlist_ticker,
    delete_position,
    execute_trade,
    get_position,
    get_user_profile,
    init_db,
    list_chat_messages,
    list_portfolio_snapshots,
    list_positions,
    list_trades,
    list_watchlist,
    record_portfolio_snapshot,
    record_trade,
    remove_watchlist_ticker,
    set_cash_balance,
    upsert_position,
)


class TestUserProfile:
    def test_seeded_profile(self):
        profile = get_user_profile()
        assert profile["id"] == "default"
        assert profile["cash_balance"] == 10000.0
        assert profile["created_at"]

    def test_set_cash_balance(self):
        set_cash_balance(7531.25)
        assert get_user_profile()["cash_balance"] == 7531.25

    def test_unknown_user_is_created(self):
        profile = get_user_profile("someone-else")
        assert profile["id"] == "someone-else"
        assert profile["cash_balance"] == 10000.0


class TestWatchlist:
    def test_default_seed_order(self):
        assert list_watchlist() == list(DEFAULT_WATCHLIST)

    def test_add_ticker(self):
        add_watchlist_ticker("PYPL")
        assert "PYPL" in list_watchlist()

    def test_add_is_idempotent(self):
        add_watchlist_ticker("PYPL")
        add_watchlist_ticker("PYPL")
        assert list_watchlist().count("PYPL") == 1

    def test_add_existing_seed_ticker_is_noop(self):
        add_watchlist_ticker("AAPL")
        assert list_watchlist() == list(DEFAULT_WATCHLIST)

    def test_ticker_is_normalized(self):
        add_watchlist_ticker(" pypl ")
        assert "PYPL" in list_watchlist()
        remove_watchlist_ticker("pypl")
        assert "PYPL" not in list_watchlist()

    def test_remove_ticker(self):
        remove_watchlist_ticker("TSLA")
        assert "TSLA" not in list_watchlist()
        assert len(list_watchlist()) == len(DEFAULT_WATCHLIST) - 1

    def test_remove_absent_ticker_is_noop(self):
        remove_watchlist_ticker("NOPE")
        assert list_watchlist() == list(DEFAULT_WATCHLIST)

    def test_per_user_isolation(self):
        add_watchlist_ticker("PYPL", user_id="other")
        assert list_watchlist("other") == ["PYPL"]
        assert "PYPL" not in list_watchlist()


class TestPositions:
    def test_empty_initially(self):
        assert list_positions() == []
        assert get_position("AAPL") is None

    def test_upsert_and_get(self):
        upsert_position("AAPL", 10, 190.0)
        position = get_position("AAPL")
        assert position["ticker"] == "AAPL"
        assert position["quantity"] == 10
        assert position["avg_cost"] == 190.0
        assert position["updated_at"]

    def test_upsert_updates_rather_than_duplicates(self):
        upsert_position("AAPL", 10, 190.0)
        upsert_position("AAPL", 15, 192.5)
        assert len(list_positions()) == 1
        assert get_position("AAPL")["quantity"] == 15
        assert get_position("AAPL")["avg_cost"] == 192.5

    def test_fractional_quantities(self):
        upsert_position("NVDA", 0.5, 800.25)
        assert get_position("NVDA")["quantity"] == 0.5

    def test_list_is_alphabetical(self):
        upsert_position("TSLA", 1, 250.0)
        upsert_position("AAPL", 1, 190.0)
        upsert_position("MSFT", 1, 420.0)
        assert [p["ticker"] for p in list_positions()] == ["AAPL", "MSFT", "TSLA"]

    def test_delete_position(self):
        upsert_position("AAPL", 10, 190.0)
        delete_position("AAPL")
        assert get_position("AAPL") is None
        assert list_positions() == []

    def test_delete_absent_position_is_noop(self):
        delete_position("AAPL")
        assert list_positions() == []

    def test_per_user_isolation(self):
        upsert_position("AAPL", 10, 190.0, user_id="other")
        assert get_position("AAPL") is None
        assert get_position("AAPL", user_id="other")["quantity"] == 10


class TestTrades:
    def test_empty_initially(self):
        assert list_trades() == []

    def test_record_returns_inserted_row(self):
        trade = record_trade("AAPL", "buy", 10, 190.0)
        assert trade["id"]
        assert trade["executed_at"]
        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "buy"
        assert trade["quantity"] == 10
        assert trade["price"] == 190.0

    def test_side_and_ticker_normalized(self):
        trade = record_trade("aapl", "SELL", 1, 190.0)
        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "sell"
        assert list_trades()[0]["side"] == "sell"

    def test_list_is_most_recent_first(self):
        record_trade("AAPL", "buy", 1, 190.0)
        record_trade("MSFT", "buy", 2, 420.0)
        record_trade("TSLA", "sell", 3, 250.0)
        assert [t["ticker"] for t in list_trades()] == ["TSLA", "MSFT", "AAPL"]

    def test_limit(self):
        for _ in range(5):
            record_trade("AAPL", "buy", 1, 190.0)
        assert len(list_trades(limit=3)) == 3

    def test_per_user_isolation(self):
        record_trade("AAPL", "buy", 1, 190.0, user_id="other")
        assert list_trades() == []
        assert len(list_trades("other")) == 1


class TestExecuteTrade:
    """The atomic trade primitive: cash + position + trade log in one transaction."""

    def test_buy_writes_all_three(self):
        trade = execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)

        position = get_position("AAPL")
        assert get_user_profile()["cash_balance"] == 8100.0
        assert position["quantity"] == 10
        assert position["avg_cost"] == 190.0
        assert list_trades() == [trade]
        assert trade["side"] == "buy"
        assert trade["id"] and trade["executed_at"]

    def test_buy_into_existing_position_updates_it(self):
        execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)
        execute_trade("AAPL", "buy", 10, 200.0, 6100.0, 20, 195.0)

        assert len(list_positions()) == 1
        assert get_position("AAPL")["quantity"] == 20
        assert get_position("AAPL")["avg_cost"] == 195.0
        assert len(list_trades()) == 2

    def test_sell_to_zero_deletes_position(self):
        execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)
        execute_trade("AAPL", "sell", 10, 200.0, 10100.0, 0, 190.0)

        assert get_position("AAPL") is None
        assert list_positions() == []
        assert get_user_profile()["cash_balance"] == 10100.0
        assert [t["side"] for t in list_trades()] == ["sell", "buy"]

    def test_partial_sell_keeps_position(self):
        execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)
        execute_trade("AAPL", "sell", 4, 200.0, 8900.0, 6, 190.0)

        assert get_position("AAPL")["quantity"] == 6
        assert get_position("AAPL")["avg_cost"] == 190.0

    def test_ticker_and_side_normalized(self):
        trade = execute_trade(" aapl ", "BUY", 10, 190.0, 8100.0, 10, 190.0)
        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "buy"
        assert get_position("aapl")["quantity"] == 10

    def test_failure_rolls_back_all_writes(self, monkeypatch):
        from app.db import queries

        def boom(conn, trade):
            raise RuntimeError("trade log write failed")

        monkeypatch.setattr(queries, "_insert_trade", boom)

        with pytest.raises(RuntimeError):
            queries.execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)

        assert get_user_profile()["cash_balance"] == 10000.0
        assert get_position("AAPL") is None
        assert list_trades() == []

    def test_failure_rolls_back_position_delete(self, monkeypatch):
        from app.db import queries

        execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0)

        def boom(conn, trade):
            raise RuntimeError("trade log write failed")

        monkeypatch.setattr(queries, "_insert_trade", boom)

        with pytest.raises(RuntimeError):
            queries.execute_trade("AAPL", "sell", 10, 200.0, 10100.0, 0, 190.0)

        assert get_position("AAPL")["quantity"] == 10
        assert get_user_profile()["cash_balance"] == 8100.0
        assert len(list_trades()) == 1

    def test_per_user_isolation(self):
        get_user_profile("other")  # Materialize the profile row before updating its cash
        execute_trade("AAPL", "buy", 10, 190.0, 8100.0, 10, 190.0, user_id="other")

        assert get_user_profile("other")["cash_balance"] == 8100.0
        assert get_position("AAPL", user_id="other")["quantity"] == 10
        assert get_user_profile()["cash_balance"] == 10000.0
        assert get_position("AAPL") is None
        assert list_trades() == []


class TestPortfolioSnapshots:
    def test_empty_initially(self):
        assert list_portfolio_snapshots() == []

    def test_records_snapshot(self):
        record_portfolio_snapshot(10000.0)
        snapshots = list_portfolio_snapshots()
        assert len(snapshots) == 1
        assert snapshots[0]["total_value"] == 10000.0
        assert snapshots[0]["recorded_at"]

    def test_chronological_order(self):
        for value in (10000.0, 10100.0, 9900.0):
            record_portfolio_snapshot(value)
        assert [s["total_value"] for s in list_portfolio_snapshots()] == [10000.0, 10100.0, 9900.0]

    def test_limit_keeps_most_recent_but_stays_chronological(self):
        for value in (1.0, 2.0, 3.0, 4.0):
            record_portfolio_snapshot(value)
        assert [s["total_value"] for s in list_portfolio_snapshots(limit=2)] == [3.0, 4.0]


class TestChatMessages:
    def test_empty_initially(self):
        assert list_chat_messages() == []

    def test_user_message_has_no_actions(self):
        message = add_chat_message("user", "How is my portfolio doing?")
        assert message["role"] == "user"
        assert message["actions"] is None
        assert list_chat_messages()[0]["actions"] is None

    def test_actions_round_trip_as_python_object(self):
        actions = {
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
            "watchlist_changes": [{"ticker": "PYPL", "action": "add"}],
        }
        add_chat_message("assistant", "Bought 10 AAPL.", actions=actions)
        stored = list_chat_messages()[0]
        assert stored["actions"] == actions

    def test_list_actions_accepted(self):
        add_chat_message("assistant", "Done.", actions=[{"ticker": "AAPL"}])
        assert list_chat_messages()[0]["actions"] == [{"ticker": "AAPL"}]

    def test_chronological_order(self):
        add_chat_message("user", "first")
        add_chat_message("assistant", "second")
        add_chat_message("user", "third")
        assert [m["content"] for m in list_chat_messages()] == ["first", "second", "third"]

    def test_limit_keeps_most_recent_but_stays_chronological(self):
        for content in ("a", "b", "c", "d"):
            add_chat_message("user", content)
        assert [m["content"] for m in list_chat_messages(limit=2)] == ["c", "d"]

    def test_per_user_isolation(self):
        add_chat_message("user", "hello", user_id="other")
        assert list_chat_messages() == []
        assert len(list_chat_messages("other")) == 1


class TestExplicitInitPath:
    def test_functions_use_explicitly_initialized_database(self, tmp_path):
        init_db(str(tmp_path / "explicit.db"))
        add_watchlist_ticker("PYPL")
        assert "PYPL" in list_watchlist()
        assert (tmp_path / "explicit.db").exists()
