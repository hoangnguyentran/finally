"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { ChatMessage, ExecutedTrade, WatchlistChange } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const SUGGESTIONS = [
  "How is my portfolio doing?",
  "Buy 5 shares of NVDA",
  "Add PYPL to my watchlist",
];

function TradeChip({ trade }: { trade: ExecutedTrade }) {
  if (trade.error) {
    return (
      <li className="rounded-xs border border-down/50 bg-down/10 px-1.5 py-1 text-[10px] text-down">
        {trade.side.toUpperCase()} {trade.ticker} failed — {trade.error}
      </li>
    );
  }
  const tone = trade.side === "buy" ? "border-violet/60 bg-violet/15 text-ink" : "border-down/50 bg-down/10 text-down";
  return (
    <li className={`tnum rounded-xs border px-1.5 py-1 text-[10px] ${tone}`}>
      {trade.side.toUpperCase()} {formatQuantity(trade.quantity)} {trade.ticker}
      {trade.price != null && ` @ ${formatPrice(trade.price)}`}
    </li>
  );
}

function WatchlistChip({ change }: { change: WatchlistChange }) {
  if (change.error) {
    return (
      <li className="rounded-xs border border-down/50 bg-down/10 px-1.5 py-1 text-[10px] text-down">
        {change.action} {change.ticker} failed — {change.error}
      </li>
    );
  }
  return (
    <li className="rounded-xs border border-brand/50 bg-brand/10 px-1.5 py-1 text-[10px] text-brand">
      Watchlist {change.action === "add" ? "+" : "−"} {change.ticker}
    </li>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const actions = [...(message.trades ?? []), ...(message.watchlist_changes ?? [])];

  return (
    <li className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[92%] rounded-sm px-2 py-1.5 text-xs leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-violet/25 text-ink"
            : message.failed
              ? "border border-down/50 bg-down/10 text-down"
              : "border border-edge bg-panel-alt text-ink"
        }`}
      >
        {message.content}
      </div>
      {actions.length > 0 && (
        <ul className="mt-1 flex max-w-[92%] flex-wrap gap-1">
          {message.trades?.map((trade, index) => (
            <TradeChip key={`t${index}`} trade={trade} />
          ))}
          {message.watchlist_changes?.map((change, index) => (
            <WatchlistChip key={`w${index}`} change={change} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ChatPanel() {
  const chat = useAppStore((state) => state.chat);
  const chatPending = useAppStore((state) => state.chatPending);
  const sendChat = useAppStore((state) => state.sendChat);

  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.length, chatPending]);

  const send = (text: string) => {
    if (!text.trim() || chatPending) return;
    void sendChat(text);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand AI assistant"
        aria-expanded={false}
        className="flex shrink-0 items-center justify-center gap-2 border border-edge bg-panel py-2 text-[10px] tracking-[0.2em] text-ink-dim uppercase hover:bg-panel-alt xl:w-9 xl:flex-col xl:py-3"
      >
        <span className="text-accent">AI</span>
        <span className="xl:[writing-mode:vertical-rl]">Assistant</span>
      </button>
    );
  }

  return (
    <section
      aria-label="AI assistant"
      className="flex min-h-[320px] shrink-0 flex-col border border-edge bg-panel xl:w-[340px]"
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-edge-soft bg-panel-alt px-2">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-ink-dim uppercase">
          <span className="text-accent">AI</span> Assistant
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse AI assistant"
          aria-expanded
          className="px-1 text-ink-faint hover:text-ink"
        >
          ›
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {chat.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Ask FinAlly about your portfolio, request analysis, or have it trade for you.
            </p>
            <ul className="space-y-1">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="w-full rounded-xs border border-edge bg-panel-alt px-2 py-1 text-left text-[11px] text-ink-dim hover:border-brand hover:text-ink"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2">
          {chat.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </ul>

        {chatPending && (
          <div role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            FinAlly is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-edge-soft p-1.5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Message FinAlly"
          placeholder="Message FinAlly…"
          rows={2}
          className="w-full resize-none rounded-xs border border-edge bg-void px-2 py-1.5 text-xs placeholder:text-ink-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => send(draft)}
          disabled={!draft.trim() || chatPending}
          className="mt-1 w-full rounded-xs bg-violet py-1.5 text-[11px] font-bold tracking-widest text-white transition-opacity hover:opacity-85 disabled:opacity-35"
        >
          SEND
        </button>
      </div>
    </section>
  );
}
