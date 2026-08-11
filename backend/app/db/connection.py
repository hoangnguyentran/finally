"""SQLite connection handling, path resolution, and lazy initialization."""

from __future__ import annotations

import logging
import os
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from .schema import DEFAULT_CASH_BALANCE, DEFAULT_USER_ID, DEFAULT_WATCHLIST, SCHEMA_SQL

logger = logging.getLogger(__name__)

# <repo-root>/db/finally.db — this file is at <repo-root>/backend/app/db/connection.py
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = REPO_ROOT / "db" / "finally.db"

_configured_path: Path | None = None
_initialized: set[Path] = set()
_lock = Lock()


def utc_now() -> str:
    """Current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    """Fresh UUID4 primary key."""
    return str(uuid.uuid4())


def _resolve_db_path(db_path: str | None = None) -> Path:
    """Resolve the database file path: explicit arg > DATABASE_PATH env > repo-root default."""
    if db_path:
        return Path(db_path).expanduser().resolve()
    env_path = os.environ.get("DATABASE_PATH", "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    return DEFAULT_DB_PATH


def _active_path() -> Path:
    """The path currently in use, honouring an explicit init_db() override."""
    return _configured_path if _configured_path is not None else _resolve_db_path()


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # WAL lets the background snapshot task write while SSE/API reads are in flight
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _create_and_seed(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = _connect(path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.execute(
            "INSERT OR IGNORE INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, DEFAULT_CASH_BALANCE, utc_now()),
        )
        # Only seed tickers into a completely empty watchlist, so a user who deleted
        # every ticker doesn't get them back on the next startup.
        if conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 0:
            now = utc_now()
            conn.executemany(
                "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                [(new_id(), DEFAULT_USER_ID, ticker, now) for ticker in DEFAULT_WATCHLIST],
            )
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str | None = None) -> None:
    """Create the schema and seed default data if needed. Safe to call repeatedly.

    An explicit db_path becomes the path used by all subsequent calls; otherwise the
    DATABASE_PATH environment variable is used, falling back to <repo-root>/db/finally.db.
    """
    global _configured_path

    with _lock:
        if db_path:
            _configured_path = _resolve_db_path(db_path)
            path = _configured_path
        else:
            path = _active_path()
        _create_and_seed(path)
        _initialized.add(path)
        logger.info("Database ready at %s", path)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Short-lived connection to the active database, committed and closed on exit.

    Initializes the database on first use. Everything done inside the block is one
    transaction: it commits on clean exit and rolls back if an exception escapes.
    """
    path = _active_path()
    if path not in _initialized:
        init_db()
        path = _active_path()

    conn = _connect(path)
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
