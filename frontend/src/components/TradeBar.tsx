"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { TradeSide } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function TradeBar() {
  const selectedTicker = useAppStore((state) => state.selectedTicker);
  const trade = useAppStore((state) => state.trade);
  const notice = useAppStore((state) => state.notice);
  const price = useAppStore((state) => (state.selectedTicker ? state.prices[state.selectedTicker]?.price : undefined));

  // The ticker field tracks the selected ticker until the trader types their
  // own, and snaps back whenever a different ticker is selected.
  const [typedTicker, setTypedTicker] = useState<string | null>(null);
  const [lastSelected, setLastSelected] = useState(selectedTicker);
  const [quantity, setQuantity] = useState("1");
  const [pending, setPending] = useState<TradeSide | null>(null);

  if (selectedTicker !== lastSelected) {
    setLastSelected(selectedTicker);
    setTypedTicker(null);
  }

  const ticker = typedTicker ?? selectedTicker ?? "";
  const setTicker = setTypedTicker;
  const parsedQuantity = Number(quantity);
  const valid = ticker.trim().length > 0 && Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const estimate = valid && price ? parsedQuantity * price : null;

  const submit = async (side: TradeSide) => {
    if (!valid || pending) return;
    setPending(side);
    await trade(ticker, parsedQuantity, side);
    setPending(null);
  };

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border border-edge bg-panel px-2 py-1.5">
      <span className="text-[10px] tracking-[0.14em] text-ink-dim uppercase">Order</span>

      <input
        value={ticker}
        onChange={(event) => setTicker(event.target.value.toUpperCase())}
        aria-label="Trade ticker"
        placeholder="TICKER"
        maxLength={8}
        className="tnum w-24 rounded-xs border border-edge bg-void px-2 py-1 text-xs tracking-wider placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />

      <input
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        aria-label="Trade quantity"
        placeholder="QTY"
        inputMode="decimal"
        className="tnum w-24 rounded-xs border border-edge bg-void px-2 py-1 text-right text-xs focus:border-brand focus:outline-none"
      />

      <button
        type="button"
        onClick={() => void submit("buy")}
        disabled={!valid || pending !== null}
        className="rounded-xs bg-violet px-4 py-1.5 text-[11px] font-bold tracking-widest text-white transition-opacity hover:opacity-85 disabled:opacity-35"
      >
        {pending === "buy" ? "…" : "BUY"}
      </button>

      <button
        type="button"
        onClick={() => void submit("sell")}
        disabled={!valid || pending !== null}
        className="rounded-xs border border-down/70 bg-down/15 px-4 py-1.5 text-[11px] font-bold tracking-widest text-down transition-colors hover:bg-down/25 disabled:opacity-35"
      >
        {pending === "sell" ? "…" : "SELL"}
      </button>

      <span className="tnum text-[11px] text-ink-dim">
        {estimate != null ? `≈ ${formatMoney(estimate)}` : "market order · instant fill"}
      </span>

      {notice && (
        <span role="status" className="ml-auto truncate text-[11px] text-accent">
          {notice}
        </span>
      )}
    </div>
  );
}
