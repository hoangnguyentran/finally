"""Fixtures for portfolio service tests: throwaway DB, seeded cache, stub feed."""

import pytest

from app.db import connection
from app.market import MarketDataSource, PriceCache
from app.services import PortfolioService


class StubMarketSource(MarketDataSource):
    """Records lifecycle calls instead of producing prices."""

    def __init__(self, price_cache: PriceCache) -> None:
        self.price_cache = price_cache
        self.tickers: list[str] = []
        self.started = False
        self.stopped = False

    async def start(self, tickers: list[str]) -> None:
        self.tickers = list(tickers)
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self.tickers:
            self.tickers.append(ticker)

    async def remove_ticker(self, ticker: str) -> None:
        if ticker in self.tickers:
            self.tickers.remove(ticker)
        self.price_cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self.tickers)


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
def service(price_cache, market_source) -> PortfolioService:
    return PortfolioService(price_cache, market_source)
