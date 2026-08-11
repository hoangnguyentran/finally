"use client";

import { useMemo, useState, type FormEvent } from "react";
import { PriceCell } from "./PriceCell";
import { Sparkline } from "./Sparkline";
import { Panel } from "./Panel";
import { formatPercent, toneClass } from "@/lib/format";
import { SPARKLINE_POINTS, useAppStore } from "@/store/useAppStore";

function WatchlistRow({ ticker }: { ticker: string }) {
  const price = useAppStore((state) => state.prices[ticker]?.price ?? null);
  const series = useAppStore((state) => state.history[ticker]);
  const selected = useAppStore((state) => state.selectedTicker === ticker);
  const selectTicker = useAppStore((state) => state.selectTicker);
  const removeTicker = useAppStore((state) => state.removeTicker);

  const points = useMemo(() => (series ?? []).slice(-SPARKLINE_POINTS), [series]);

  // "Change" is measured from the first price seen this session, matching the
  // sparkline window — the stream carries tick-to-tick deltas, not daily ones.
  const sessionChange = points.length > 1 ? ((points[points.length - 1].p - points[0].p) / points[0].p) * 100 : 0;

  return (
    <tr
      onClick={() => selectTicker(ticker)}
      aria-selected={selected}
      className={`group cursor-pointer border-b border-edge-soft/60 transition-colors ${
        selected ? "bg-brand/12" : "hover:bg-panel-alt"
      }`}
    >
      <td className="py-1 pl-2 pr-1">
        <span
          className={`font-semibold tracking-wide ${selected ? "text-brand" : "text-ink"}`}
        >
          {ticker}
        </span>
      </td>
      <td className="py-1 text-right">
        <PriceCell price={price} />
      </td>
      <td
        className={`tnum py-1 pr-1 text-right text-[11px] ${toneClass(sessionChange)}`}
        title="Change since page load"
      >
        {points.length > 1 ? formatPercent(sessionChange) : "—"}
      </td>
      <td className="py-1 pr-1 align-middle">
        <Sparkline points={points} label={ticker} />
      </td>
      <td className="w-6 py-1 pr-1 text-right">
        <button
          type="button"
          aria-label={`Remove ${ticker} from watchlist`}
          onClick={(event) => {
            event.stopPropagation();
            void removeTicker(ticker);
          }}
          className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-down focus-visible:opacity-100"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

export function Watchlist({ className = "" }: { className?: string }) {
  const watchlist = useAppStore((state) => state.watchlist);
  const priceTickers = useAppStore((state) => state.prices);
  const addTicker = useAppStore((state) => state.addTicker);
  const [draft, setDraft] = useState("");

  // Before the watchlist endpoint answers, show whatever the stream is carrying.
  const tickers = useMemo(
    () => (watchlist.length ? watchlist.map((item) => item.ticker) : Object.keys(priceTickers).sort()),
    [watchlist, priceTickers],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void addTicker(draft);
    setDraft("");
  };

  return (
    <Panel
      title="Watchlist"
      accessory={<span className="tnum text-[10px] text-ink-faint">{tickers.length}</span>}
      bodyClassName="flex flex-col"
      className={className}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Watched tickers with live prices</caption>
          <tbody>
            {tickers.map((ticker) => (
              <WatchlistRow key={ticker} ticker={ticker} />
            ))}
          </tbody>
        </table>
        {tickers.length === 0 && (
          <p className="p-3 text-[11px] text-ink-faint">Waiting for the price stream…</p>
        )}
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-1 border-t border-edge-soft p-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="ADD TICKER"
          aria-label="Add ticker"
          maxLength={8}
          className="tnum min-w-0 flex-1 rounded-xs border border-edge bg-void px-1.5 py-1 text-xs tracking-wider placeholder:text-ink-faint focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xs bg-brand px-2 py-1 text-[11px] font-semibold text-void transition-opacity hover:opacity-85 disabled:opacity-40"
          disabled={!draft.trim()}
        >
          ADD
        </button>
      </form>
    </Panel>
  );
}
