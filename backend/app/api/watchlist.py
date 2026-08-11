"""REST routes for managing the watchlist."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import PortfolioService, TradeError


class WatchlistRequest(BaseModel):
    ticker: str = Field(min_length=1)


def create_watchlist_router(service: PortfolioService) -> APIRouter:
    """Create the watchlist router bound to a PortfolioService instance."""
    router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

    @router.get("")
    async def get_watchlist() -> list[dict]:
        """Watched tickers with their latest prices."""
        return service.get_watchlist()

    @router.post("")
    async def add_ticker(request: WatchlistRequest) -> list[dict]:
        """Add a ticker and begin streaming its price. Returns the updated watchlist."""
        try:
            await service.add_watchlist_ticker(request.ticker)
        except TradeError as exc:
            raise HTTPException(status_code=400, detail=exc.message) from exc
        return service.get_watchlist()

    @router.delete("/{ticker}")
    async def remove_ticker(ticker: str) -> list[dict]:
        """Remove a ticker and stop streaming it. Returns the updated watchlist."""
        await service.remove_watchlist_ticker(ticker)
        return service.get_watchlist()

    return router
