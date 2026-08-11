"""Tests for schema creation, seeding, and database path resolution."""

import sqlite3

from app.db import DEFAULT_WATCHLIST, init_db, list_watchlist
from app.db.connection import DEFAULT_DB_PATH, _resolve_db_path

EXPECTED_TABLES = {
    "users_profile",
    "watchlist",
    "positions",
    "trades",
    "portfolio_snapshots",
    "chat_messages",
}


def _table_names(path):
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    finally:
        conn.close()
    return {row[0] for row in rows}


class TestInitialization:
    """Schema creation and seed data."""

    def test_creates_file_and_tables(self, temp_db):
        init_db()
        assert temp_db.exists()
        assert EXPECTED_TABLES <= _table_names(temp_db)

    def test_seeds_default_profile(self, temp_db):
        init_db()
        conn = sqlite3.connect(temp_db)
        rows = conn.execute("SELECT id, cash_balance FROM users_profile").fetchall()
        conn.close()
        assert rows == [("default", 10000.0)]

    def test_seeds_default_watchlist(self, temp_db):
        init_db()
        assert list_watchlist() == list(DEFAULT_WATCHLIST)

    def test_creates_parent_directory(self, tmp_path):
        nested = tmp_path / "nested" / "dir" / "finally.db"
        init_db(str(nested))
        assert nested.exists()

    def test_repeated_init_does_not_duplicate_seed_data(self, temp_db):
        init_db()
        init_db()
        init_db()
        assert list_watchlist() == list(DEFAULT_WATCHLIST)
        conn = sqlite3.connect(temp_db)
        profiles = conn.execute("SELECT COUNT(*) FROM users_profile").fetchone()[0]
        conn.close()
        assert profiles == 1

    def test_reinit_preserves_existing_data(self, temp_db):
        from app.db import remove_watchlist_ticker, set_cash_balance

        init_db()
        set_cash_balance(4200.0)
        remove_watchlist_ticker("TSLA")

        init_db()

        from app.db import get_user_profile

        assert get_user_profile()["cash_balance"] == 4200.0
        assert "TSLA" not in list_watchlist()

    def test_lazy_init_on_first_query(self, temp_db):
        assert not temp_db.exists()
        assert list_watchlist() == list(DEFAULT_WATCHLIST)
        assert temp_db.exists()


class TestPathResolution:
    """DATABASE_PATH override and repo-root default."""

    def test_explicit_path_wins(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "env.db"))
        explicit = tmp_path / "explicit.db"
        assert _resolve_db_path(str(explicit)) == explicit.resolve()

    def test_env_var_used_when_no_explicit_path(self, tmp_path, monkeypatch):
        env_db = tmp_path / "env.db"
        monkeypatch.setenv("DATABASE_PATH", str(env_db))
        assert _resolve_db_path() == env_db.resolve()

    def test_default_is_repo_root_db_dir(self, monkeypatch):
        monkeypatch.delenv("DATABASE_PATH", raising=False)
        resolved = _resolve_db_path()
        assert resolved == DEFAULT_DB_PATH
        assert resolved.parent.name == "db"
        assert resolved.name == "finally.db"

    def test_explicit_init_path_is_used_by_later_calls(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "env.db"))
        explicit = tmp_path / "explicit.db"
        init_db(str(explicit))
        list_watchlist()
        assert explicit.exists()
        assert not (tmp_path / "env.db").exists()
