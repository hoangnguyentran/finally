"""REST route for the AI chat assistant."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.db import list_chat_messages
from app.services import PortfolioService

from .chat import ChatError, handle_chat_message

HISTORY_LIMIT = 50


class ChatRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def _reject_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message must not be blank")
        return stripped


def create_chat_router(service: PortfolioService) -> APIRouter:
    """Create the chat router bound to a PortfolioService instance."""
    router = APIRouter(prefix="/api/chat", tags=["chat"])

    @router.get("")
    async def get_history() -> list[dict]:
        """The most recent chat messages, oldest first, so the UI survives a page reload."""
        return list_chat_messages(limit=HISTORY_LIMIT)

    @router.post("")
    async def chat(request: ChatRequest) -> dict:
        """Send a message to FinAlly; any trades or watchlist changes execute immediately."""
        try:
            return await handle_chat_message(service, request.message)
        except ChatError as exc:
            raise HTTPException(status_code=502, detail=exc.message) from exc

    return router
