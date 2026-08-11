"""Chat turn handling: prompt assembly, the LLM call, and auto-execution of actions.

One chat turn is exactly one LLM call (PLAN.md section 9) — the model returns its
conversational reply plus any trades and watchlist changes in a single structured
response, those actions are executed immediately, and the per-action outcome is
reported back in the payload rather than fed to a second LLM call.
"""

from __future__ import annotations

import asyncio
import json
import logging

from dotenv import find_dotenv, load_dotenv
from litellm import completion

from app.db import add_chat_message, list_chat_messages
from app.services import PortfolioService, TradeError

from .mock import build_mock_response, is_mock_enabled
from .schemas import ChatLLMResponse, TradeAction, WatchlistChange

# The repo-root .env holds OPENROUTER_API_KEY; find_dotenv searches upward from cwd
# so this works whether the server is launched from backend/ or the repo root.
load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
HISTORY_LIMIT = 10

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant embedded in a simulated \
trading workstation. The user trades a virtual portfolio with fake money.

Your job:
- Analyze portfolio composition, risk concentration, and unrealized P&L.
- Suggest trades and always give the reasoning behind them.
- Execute trades whenever the user asks for one or agrees to one you proposed — there \
is no confirmation step, so only include a trade when the user's intent is clear.
- Manage the watchlist proactively: add tickers you are discussing, remove ones the \
user has lost interest in.
- Be concise and data-driven. Reference actual numbers from the portfolio context.

Always respond with valid JSON matching the required schema: a `message` string with \
your conversational reply, an optional `trades` array of {ticker, side, quantity}, and \
an optional `watchlist_changes` array of {ticker, action}. Side is "buy" or "sell"; \
action is "add" or "remove". Leave the arrays empty when no action is needed."""


class ChatError(Exception):
    """The LLM call failed or returned something unusable."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


async def handle_chat_message(service: PortfolioService, user_message: str) -> dict:
    """Run one chat turn: prompt the LLM, execute its actions, persist, and return the payload."""
    portfolio = service.get_portfolio()
    watchlist = service.get_watchlist()

    if is_mock_enabled():
        llm_response = build_mock_response(user_message, portfolio)
    else:
        messages = _build_messages(portfolio, watchlist, user_message)
        llm_response = await _call_llm(messages)

    trade_results = [_execute_trade(service, trade) for trade in llm_response.trades]
    watchlist_results = [
        await _apply_watchlist_change(service, change) for change in llm_response.watchlist_changes
    ]

    add_chat_message(role="user", content=user_message)
    add_chat_message(
        role="assistant",
        content=llm_response.message,
        actions={"trades": trade_results, "watchlist_changes": watchlist_results},
    )

    return {
        "message": llm_response.message,
        "trades": trade_results,
        "watchlist_changes": watchlist_results,
    }


# --- Prompt assembly ------------------------------------------------------


def _build_messages(portfolio: dict, watchlist: list[dict], user_message: str) -> list[dict]:
    """System prompt, live account context, recent history, then the new user message."""
    context = {
        "cash_balance": portfolio["cash_balance"],
        "total_value": portfolio["total_value"],
        "positions_value": portfolio["positions_value"],
        "unrealized_pnl": portfolio["unrealized_pnl"],
        "unrealized_pnl_percent": portfolio["unrealized_pnl_percent"],
        "positions": portfolio["positions"],
        "watchlist": watchlist,
    }

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "system",
            "content": "Current account state (live data):\n" + json.dumps(context),
        },
    ]
    messages.extend(
        {"role": message["role"], "content": message["content"]}
        for message in list_chat_messages(limit=HISTORY_LIMIT)
    )
    messages.append({"role": "user", "content": user_message})
    return messages


async def _call_llm(messages: list[dict]) -> ChatLLMResponse:
    """Call the model via LiteLLM/OpenRouter on Cerebras, off the event loop thread."""
    try:
        response = await asyncio.to_thread(
            completion,
            model=MODEL,
            messages=messages,
            response_format=ChatLLMResponse,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
        )
        return ChatLLMResponse.model_validate_json(response.choices[0].message.content)
    except Exception as exc:
        logger.exception("LLM chat call failed")
        raise ChatError(f"The AI assistant is unavailable right now: {exc}") from exc


# --- Auto-execution -------------------------------------------------------


def _execute_trade(service: PortfolioService, trade: TradeAction) -> dict:
    """Execute one LLM-requested trade; a failure is reported, never raised."""
    result = {
        "ticker": trade.ticker.strip().upper(),
        "side": trade.side,
        "quantity": trade.quantity,
    }
    try:
        detail = service.execute_trade(trade.ticker, trade.side, trade.quantity)
        # `price` is flattened alongside the full trade dict so the UI can render the
        # fill price without reaching into `detail`.
        return {
            **result,
            "status": "executed",
            "price": detail["price"],
            "detail": detail,
            "error": None,
        }
    except TradeError as exc:
        logger.info("LLM trade rejected: %s", exc.message)
        return {**result, "status": "failed", "price": None, "detail": None, "error": exc.message}


async def _apply_watchlist_change(service: PortfolioService, change: WatchlistChange) -> dict:
    """Apply one LLM-requested watchlist change; a failure is reported, never raised."""
    result = {"ticker": change.ticker.strip().upper(), "action": change.action}
    try:
        if change.action == "add":
            await service.add_watchlist_ticker(change.ticker)
        else:
            await service.remove_watchlist_ticker(change.ticker)
        return {**result, "status": "executed", "error": None}
    except TradeError as exc:
        logger.info("LLM watchlist change rejected: %s", exc.message)
        return {**result, "status": "failed", "error": exc.message}
