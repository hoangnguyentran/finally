"""REST routes for portfolio state and trading."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import PortfolioService, TradeError


class TradeRequest(BaseModel):
    ticker: str = Field(min_length=1)
    quantity: float
    side: str


def create_portfolio_router(service: PortfolioService) -> APIRouter:
    """Create the portfolio router bound to a PortfolioService instance."""
    router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

    @router.get("")
    async def get_portfolio() -> dict:
        """Cash, positions with live P&L, and total portfolio value."""
        return service.get_portfolio()

    @router.post("/trade")
    async def execute_trade(request: TradeRequest) -> dict:
        """Execute a market order at the current price. 400 if it fails validation."""
        try:
            return service.execute_trade(request.ticker, request.side, request.quantity)
        except TradeError as exc:
            raise HTTPException(status_code=400, detail=exc.message) from exc

    @router.get("/history")
    async def get_history() -> list[dict]:
        """Portfolio value snapshots over time, oldest first."""
        return service.get_portfolio_history()

    return router
