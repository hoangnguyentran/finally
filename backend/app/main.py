"""FastAPI entrypoint: wires the market data feed, REST API, and static frontend.

Served as `app.main:app` — the Dockerfile and start scripts depend on that path.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import db
from app.api import create_portfolio_router, create_watchlist_router
from app.llm import create_chat_router
from app.market import PriceCache, create_market_data_source, create_stream_router
from app.services import PortfolioService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL_SECONDS = 30
BACKEND_ROOT = Path(__file__).resolve().parent.parent
# The image sets STATIC_DIR=/app/static; these are the local-dev fallbacks, in order:
# the copied export, then the frontend's own build output.
STATIC_DIR_FALLBACKS = (BACKEND_ROOT / "static", BACKEND_ROOT.parent / "frontend" / "out")


async def _snapshot_loop(service: PortfolioService) -> None:
    """Record total portfolio value every 30 seconds for the P&L chart."""
    while True:
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)
        try:
            db.record_portfolio_snapshot(service.get_portfolio()["total_value"])
        except Exception:
            logger.exception("Portfolio snapshot failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init_db()

    market_source = app.state.market_source
    await market_source.start(db.list_watchlist())
    snapshot_task = asyncio.create_task(_snapshot_loop(app.state.portfolio_service))

    logger.info("FinAlly backend ready")
    try:
        yield
    finally:
        snapshot_task.cancel()
        await asyncio.gather(snapshot_task, return_exceptions=True)
        await market_source.stop()
        logger.info("FinAlly backend stopped")


def _resolve_static_dir() -> Path | None:
    """The frontend export to serve: STATIC_DIR if set, else the first fallback present."""
    configured = os.environ.get("STATIC_DIR", "").strip()
    if configured:
        path = Path(configured)
        return path if path.is_dir() else None
    return next((path for path in STATIC_DIR_FALLBACKS if path.is_dir()), None)


def _mount_static(app: FastAPI) -> None:
    """Serve the exported frontend at / — skipped when no build is present."""
    static_dir = _resolve_static_dir()
    if static_dir is None:
        logger.warning("No frontend build found — serving API routes only")
        return
    logger.info("Serving frontend from %s", static_dir)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


def create_app() -> FastAPI:
    app = FastAPI(title="FinAlly", version="0.1.0", lifespan=lifespan)

    price_cache = PriceCache()
    market_source = create_market_data_source(price_cache)
    service = PortfolioService(price_cache, market_source)

    # Exposed for routers added later (the LLM chat router) via request.app.state.
    app.state.price_cache = price_cache
    app.state.market_source = market_source
    app.state.portfolio_service = service

    @app.get("/api/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok"}

    app.include_router(create_stream_router(price_cache))
    app.include_router(create_portfolio_router(service))
    app.include_router(create_watchlist_router(service))
    app.include_router(create_chat_router(service))

    # Registered last so /api/* routes take priority over the static catch-all.
    _mount_static(app)
    return app


app = create_app()
