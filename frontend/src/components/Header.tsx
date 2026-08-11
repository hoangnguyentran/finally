"use client";

import { useTotals } from "@/hooks/useTotals";
import { formatMoney, formatPercent, formatSignedMoney, toneClass } from "@/lib/format";
import { useAppStore, type ConnectionStatus } from "@/store/useAppStore";

const STATUS_META: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: "bg-up", label: "Live" },
  reconnecting: { color: "bg-accent", label: "Reconnecting" },
  disconnected: { color: "bg-down", label: "Disconnected" },
};

function Readout({
  label,
  value,
  valueClassName = "text-ink",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] tracking-[0.16em] text-ink-faint uppercase">{label}</span>
      <span className={`tnum text-sm font-semibold ${valueClassName}`}>{value}</span>
    </div>
  );
}

export function Header() {
  const connection = useAppStore((state) => state.connection);
  const totals = useTotals();
  const status = STATUS_META[connection];

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-y-1 border-b border-edge bg-panel px-3 py-1 lg:py-0">
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold tracking-[0.2em] text-accent">FIN</span>
          <span className="text-base font-bold tracking-[0.2em] text-ink">ALLY</span>
          <span className="ml-1 hidden text-[9px] tracking-[0.18em] text-ink-faint uppercase sm:inline">
            AI Trading Workstation
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 rounded-full border border-edge px-2 py-0.5"
          role="status"
          aria-live="polite"
        >
          <span
            data-testid="connection-dot"
            data-status={connection}
            className={`h-2 w-2 rounded-full ${status.color} ${
              connection === "connected" ? "" : "animate-pulse"
            }`}
          />
          <span className="text-[10px] tracking-wider text-ink-dim uppercase">
            {status.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 lg:gap-5">
        <Readout label="Cash" value={formatMoney(totals.cash)} valueClassName="text-brand" />
        <div className="hidden md:block">
          <Readout label="Positions" value={formatMoney(totals.positionsValue)} />
        </div>
        <Readout
          label="Unrealized P&L"
          value={`${formatSignedMoney(totals.unrealizedPnl)} (${formatPercent(totals.unrealizedPnlPercent)})`}
          valueClassName={toneClass(totals.unrealizedPnl)}
        />
        <Readout
          label="Portfolio Value"
          value={formatMoney(totals.totalValue)}
          valueClassName="text-accent"
        />
      </div>
    </header>
  );
}
