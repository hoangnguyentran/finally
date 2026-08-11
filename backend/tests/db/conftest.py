"""Fixtures giving each database test its own isolated SQLite file."""

import pytest

from app.db import connection


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the db module at a throwaway file and reset its init state around each test."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "finally.db"))
    connection._configured_path = None
    connection._initialized.clear()
    yield tmp_path / "finally.db"
    connection._configured_path = None
    connection._initialized.clear()
