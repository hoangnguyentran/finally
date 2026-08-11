"use client";

import { Panel } from "./Panel";
import { PriceCell } from "./PriceCell";
import { useTotals } from "@/hooks/useTotals";
import {
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedMoney,
  toneClass,
} from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

const HEADERS = [
  "Ticker",
  "Qty",
  "Avg Cost",
  "Price",
  "Mkt Value",
  "Unreal. P&L",
  "%",
] as const;

export function PositionsTable({ className = "" }: { className?: string }) {
  const totals = useTotals();
  const selectTicker = useAppStore((state) => state.selectTicker);
  const selectedTicker = useAppStore((state) => state.selectedTicker);

  return (
    <Panel
      title="Positions"
      accessory={
        <span className="tnum text-[10px] text-ink-faint">
          {totals.positions.length} · {formatMoney(totals.positionsValue)}
        </span>
      }
      bodyClassName="overflow-auto"
      className={className}
    >
      {totals.positions.length === 0 ? (
        <p className="p-3 text-[11px] text-ink-faint">
          No open positions. Use the trade bar or ask the AI assistant to buy something.
        </p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-panel">
            <tr className="border-b border-edge text-[10px] tracking-wider text-ink-faint uppercase">
              {HEADERS.map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-2 py-1 font-medium ${index === 0 ? "text-left" : "text-right"}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totals.positions.map((position) => (
              <tr
                key={position.ticker}
                onClick={() => selectTicker(position.ticker)}
                aria-selected={selectedTicker === position.ticker}
                className={`cursor-pointer border-b border-edge-soft/60 ${
                  selectedTicker === position.ticker ? "bg-brand/12" : "hover:bg-panel-alt"
                }`}
              >
                <td className="px-2 py-1 font-semibold tracking-wide">{position.ticker}</td>
                <td className="tnum px-2 py-1 text-right">
                  {formatQuantity(position.quantity)}
                </td>
                <td className="tnum px-2 py-1 text-right text-ink-dim">
                  {formatPrice(position.avg_cost)}
                </td>
                <td className="px-2 py-1 text-right">
                  <PriceCell price={position.price} />
                </td>
                <td className="tnum px-2 py-1 text-right">
                  {formatMoney(position.marketValue)}
                </td>
                <td
                  className={`tnum px-2 py-1 text-right ${toneClass(position.unrealizedPnl)}`}
                >
                  {formatSignedMoney(position.unrealizedPnl)}
                </td>
                <td
                  className={`tnum px-2 py-1 text-right ${toneClass(position.unrealizedPnl)}`}
                >
                  {formatPercent(position.unrealizedPnlPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
