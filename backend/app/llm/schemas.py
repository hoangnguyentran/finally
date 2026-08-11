"""Structured-output schema the LLM must answer with (PLAN.md section 9)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TradeAction(BaseModel):
    """A market order the assistant wants executed on the user's behalf."""

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    """A watchlist addition or removal the assistant wants applied."""

    ticker: str
    action: Literal["add", "remove"]


class ChatLLMResponse(BaseModel):
    """The complete response from a single chat turn."""

    message: str
    trades: list[TradeAction] = Field(default_factory=list)
    watchlist_changes: list[WatchlistChange] = Field(default_factory=list)
