"""Database subsystem for FinAlly.

SQLite persistence with lazy initialization: the schema is created and seeded on
first use. The database file defaults to <repo-root>/db/finally.db and can be
overridden with the DATABASE_PATH environment variable.

All functions are pure data access — trade validation and P&L math live above this layer.
"""

from .connection import DEFAULT_DB_PATH, get_connection, init_db
from .queries import (
    add_chat_message,
    add_watchlist_ticker,
    delete_position,
    execute_trade,
    get_position,
    get_user_profile,
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
from .schema import DEFAULT_CASH_BALANCE, DEFAULT_USER_ID, DEFAULT_WATCHLIST

__all__ = [
    "init_db",
    "get_connection",
    "DEFAULT_DB_PATH",
    "DEFAULT_USER_ID",
    "DEFAULT_CASH_BALANCE",
    "DEFAULT_WATCHLIST",
    "get_user_profile",
    "set_cash_balance",
    "list_watchlist",
    "add_watchlist_ticker",
    "remove_watchlist_ticker",
    "list_positions",
    "get_position",
    "upsert_position",
    "delete_position",
    "record_trade",
    "execute_trade",
    "list_trades",
    "record_portfolio_snapshot",
    "list_portfolio_snapshots",
    "add_chat_message",
    "list_chat_messages",
]
