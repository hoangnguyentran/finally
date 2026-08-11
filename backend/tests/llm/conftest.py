"""Fixtures for LLM chat tests: throwaway DB, seeded cache, stub feed, mock mode always on."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import connection
from app.llm import create_chat_router
from app.market import PriceCache
from app.services import PortfolioService
from tests.services.conftest import StubMarketSource


@pytest.fixture(autouse=True)
def mock_llm(monkeypatch):
    """No test may reach OpenRouter — the mock path is the only one exercised here."""
    monkeypatch.setenv("LLM_MOCK", "true")


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
    cache.update("PYPL", 60.0)
    return cache


@pytest.fixture
def market_source(price_cache) -> StubMarketSource:
    return StubMarketSource(price_cache)


@pytest.fixture
def service(price_cache, market_source) -> PortfolioService:
    return PortfolioService(price_cache, market_source)


@pytest.fixture
def client(service) -> TestClient:
    app = FastAPI()
    app.include_router(create_chat_router(service))
    return TestClient(app)
