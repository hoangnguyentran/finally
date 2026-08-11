"""LLM chat assistant: structured-output prompting, auto-executed actions, and the REST route.

See PLAN.md section 9. Set LLM_MOCK=true to bypass the network entirely and get
deterministic responses (see `app.llm.mock` for the recognised phrasings).
"""

from .chat import ChatError, handle_chat_message
from .router import create_chat_router
from .schemas import ChatLLMResponse, TradeAction, WatchlistChange

__all__ = [
    "ChatError",
    "ChatLLMResponse",
    "TradeAction",
    "WatchlistChange",
    "create_chat_router",
    "handle_chat_message",
]
