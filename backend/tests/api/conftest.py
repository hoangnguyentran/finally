"""Fixtures for API route tests: a bare app carrying only the routers under test."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_portfolio_router, create_watchlist_router
from app.db import connection
from app.market import PriceCache
from app.services import PortfolioService
from tests.services.conftest import StubMarketSource


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the db module at a throwaway file and reset its init state around each test."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "finally.db"))
    connection._configured_path = None
    connection._initialized.clear()
    yield tmp_path / "finally.db"
    connection._configured_path = None
    connection._initialized.clear()


@pytest.fixture
def price_cache() -> PriceCache:
    cache = PriceCache()
    cache.update("AAPL", 100.0)
    cache.update("GOOGL", 200.0)
    return cache


@pytest.fixture
def market_source(price_cache) -> StubMarketSource:
    return StubMarketSource(price_cache)


@pytest.fixture
def client(price_cache, market_source) -> TestClient:
    """A TestClient over just the REST routers — no lifespan, no live market feed."""
    service = PortfolioService(price_cache, market_source)
    app = FastAPI()
    app.include_router(create_portfolio_router(service))
    app.include_router(create_watchlist_router(service))
    return TestClient(app)
