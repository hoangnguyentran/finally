"""Data-access functions for FinAlly. Pure CRUD — no business logic lives here."""

from __future__ import annotations

import json
import sqlite3

from .connection import get_connection, new_id, utc_now
from .schema import DEFAULT_CASH_BALANCE, DEFAULT_USER_ID


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(row) for row in rows]


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


# --- User profile ---------------------------------------------------------


def get_user_profile(user_id: str = DEFAULT_USER_ID) -> dict:
    """Return {id, cash_balance, created_at}, creating the profile if it doesn't exist."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, cash_balance, created_at FROM users_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
                (user_id, DEFAULT_CASH_BALANCE, utc_now()),
            )
            row = conn.execute(
                "SELECT id, cash_balance, created_at FROM users_profile WHERE id = ?",
                (user_id,),
            ).fetchone()
        return dict(row)


def _set_cash_balance(conn: sqlite3.Connection, new_balance: float, user_id: str) -> None:
    conn.execute(
        "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
        (new_balance, user_id),
    )


def set_cash_balance(new_balance: float, user_id: str = DEFAULT_USER_ID) -> None:
    """Overwrite the cash balance for a user."""
    with get_connection() as conn:
        _set_cash_balance(conn, new_balance, user_id)


# --- Watchlist ------------------------------------------------------------


def list_watchlist(user_id: str = DEFAULT_USER_ID) -> list[str]:
    """Watchlist tickers in the order they were added."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid",
            (user_id,),
        ).fetchall()
        return [row["ticker"] for row in rows]


def add_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> None:
    """Add a ticker to the watchlist. No-op if already present."""
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, _normalize_ticker(ticker), utc_now()),
        )


def remove_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> None:
    """Remove a ticker from the watchlist. No-op if absent."""
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
            (user_id, _normalize_ticker(ticker)),
        )


# --- Positions ------------------------------------------------------------


def list_positions(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """All positions as [{ticker, quantity, avg_cost, updated_at}], alphabetical by ticker."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions"
            " WHERE user_id = ? ORDER BY ticker",
            (user_id,),
        ).fetchall()
        return _rows_to_dicts(rows)


def get_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict | None:
    """A single position, or None if the user holds no shares of that ticker."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT ticker, quantity, avg_cost, updated_at FROM positions"
            " WHERE user_id = ? AND ticker = ?",
            (user_id, _normalize_ticker(ticker)),
        ).fetchone()
        return dict(row) if row else None


def _upsert_position(
    conn: sqlite3.Connection,
    ticker: str,
    quantity: float,
    avg_cost: float,
    user_id: str,
) -> None:
    conn.execute(
        "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (user_id, ticker) DO UPDATE SET"
        " quantity = excluded.quantity,"
        " avg_cost = excluded.avg_cost,"
        " updated_at = excluded.updated_at",
        (new_id(), user_id, ticker, quantity, avg_cost, utc_now()),
    )


def _delete_position(conn: sqlite3.Connection, ticker: str, user_id: str) -> None:
    conn.execute(
        "DELETE FROM positions WHERE user_id = ? AND ticker = ?",
        (user_id, ticker),
    )


def upsert_position(
    ticker: str,
    quantity: float,
    avg_cost: float,
    user_id: str = DEFAULT_USER_ID,
) -> None:
    """Insert a position, or overwrite quantity/avg_cost if one already exists."""
    with get_connection() as conn:
        _upsert_position(conn, _normalize_ticker(ticker), quantity, avg_cost, user_id)


def delete_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> None:
    """Remove a position entirely. No-op if absent."""
    with get_connection() as conn:
        _delete_position(conn, _normalize_ticker(ticker), user_id)


# --- Trades ---------------------------------------------------------------


def _build_trade(ticker: str, side: str, quantity: float, price: float, user_id: str) -> dict:
    return {
        "id": new_id(),
        "user_id": user_id,
        "ticker": _normalize_ticker(ticker),
        "side": side.strip().lower(),
        "quantity": quantity,
        "price": price,
        "executed_at": utc_now(),
    }


def _insert_trade(conn: sqlite3.Connection, trade: dict) -> None:
    conn.execute(
        "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at)"
        " VALUES (:id, :user_id, :ticker, :side, :quantity, :price, :executed_at)",
        trade,
    )


def record_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    """Append a trade to the log. Returns the inserted row including id and executed_at."""
    trade = _build_trade(ticker, side, quantity, price, user_id)
    with get_connection() as conn:
        _insert_trade(conn, trade)
    return trade


def execute_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    new_cash_balance: float,
    new_quantity: float,
    new_avg_cost: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    """Apply a validated trade's three writes in one transaction. Returns the trade row.

    Updates the cash balance, then writes the resulting position (deleting it when
    new_quantity <= 0), then appends the trade to the log. The caller validates the
    trade and computes the new balance, quantity, and average cost; nothing is
    validated here. Either all three writes land or none do.
    """
    trade = _build_trade(ticker, side, quantity, price, user_id)
    with get_connection() as conn:
        _set_cash_balance(conn, new_cash_balance, user_id)
        if new_quantity <= 0:
            _delete_position(conn, trade["ticker"], user_id)
        else:
            _upsert_position(conn, trade["ticker"], new_quantity, new_avg_cost, user_id)
        _insert_trade(conn, trade)
    return trade


def list_trades(user_id: str = DEFAULT_USER_ID, limit: int = 100) -> list[dict]:
    """Trade history, most recent first."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, user_id, ticker, side, quantity, price, executed_at FROM trades"
            " WHERE user_id = ? ORDER BY executed_at DESC, rowid DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return _rows_to_dicts(rows)


# --- Portfolio snapshots --------------------------------------------------


def record_portfolio_snapshot(total_value: float, user_id: str = DEFAULT_USER_ID) -> None:
    """Append a total-portfolio-value snapshot for the P&L chart."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at)"
            " VALUES (?, ?, ?, ?)",
            (new_id(), user_id, total_value, utc_now()),
        )


def list_portfolio_snapshots(user_id: str = DEFAULT_USER_ID, limit: int = 500) -> list[dict]:
    """The most recent `limit` snapshots, returned oldest first for charting."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, user_id, total_value, recorded_at FROM ("
            "  SELECT id, user_id, total_value, recorded_at, rowid FROM portfolio_snapshots"
            "  WHERE user_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT ?"
            ") ORDER BY recorded_at, rowid",
            (user_id, limit),
        ).fetchall()
        return _rows_to_dicts(rows)


# --- Chat messages --------------------------------------------------------


def add_chat_message(
    role: str,
    content: str,
    actions: dict | list | None = None,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    """Append a chat message. `actions` is stored as JSON text and returned decoded."""
    message_id = new_id()
    created_at = utc_now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                message_id,
                user_id,
                role,
                content,
                json.dumps(actions) if actions is not None else None,
                created_at,
            ),
        )
    return {
        "id": message_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "actions": actions,
        "created_at": created_at,
    }


def list_chat_messages(user_id: str = DEFAULT_USER_ID, limit: int = 50) -> list[dict]:
    """The most recent `limit` messages, returned oldest first with `actions` JSON-decoded."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, user_id, role, content, actions, created_at FROM ("
            "  SELECT id, user_id, role, content, actions, created_at, rowid FROM chat_messages"
            "  WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
            ") ORDER BY created_at, rowid",
            (user_id, limit),
        ).fetchall()

    messages = []
    for row in rows:
        message = dict(row)
        message["actions"] = json.loads(message["actions"]) if message["actions"] else None
        messages.append(message)
    return messages
