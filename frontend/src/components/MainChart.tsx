"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartArea } from "./ChartArea";
import { Panel } from "./Panel";
import { PriceCell } from "./PriceCell";
import { formatClock, formatPercent, formatPrice, toneClass } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

const AXIS = { stroke: "#6b7683", fontSize: 10, fontFamily: "var(--font-mono)" };

export function MainChart({ className = "" }: { className?: string }) {
  const ticker = useAppStore((state) => state.selectedTicker);
  const series = useAppStore((state) => (ticker ? state.history[ticker] : undefined));
  const price = useAppStore((state) => (ticker ? (state.prices[ticker]?.price ?? null) : null));

  const data = useMemo(() => series ?? [], [series]);
  const sessionChange =
    data.length > 1 ? ((data[data.length - 1].p - data[0].p) / data[0].p) * 100 : 0;
  const tone = sessionChange >= 0 ? "var(--color-up)" : "var(--color-down)";

  return (
    <Panel
      title={ticker ? `${ticker} · Session` : "Chart"}
      accessory={
        <div className="flex items-center gap-2 text-[11px]">
          <PriceCell price={price} className="font-semibold" />
          <span className={`tnum ${toneClass(sessionChange)}`}>
            {data.length > 1 ? formatPercent(sessionChange) : "—"}
          </span>
        </div>
      }
      bodyClassName="relative"
      className={className}
    >
      {data.length < 2 ? (
        <ChartArea>
          <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">
            {ticker
              ? "Accumulating price history from the live stream…"
              : "Select a ticker from the watchlist"}
          </div>
        </ChartArea>
      ) : (
        <ChartArea>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mainChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tone} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={tone} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2530" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatClock}
                minTickGap={48}
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: "#262d3a" }}
              />
              <YAxis
                dataKey="p"
                domain={["dataMin - 0.05", "dataMax + 0.05"]}
                tickFormatter={(value: number) => formatPrice(value)}
                width={58}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: "#131a24",
                  border: "1px solid #262d3a",
                  borderRadius: 2,
                  fontSize: 11,
                }}
                labelFormatter={(label) => formatClock(Number(label))}
                formatter={(value) => [formatPrice(Number(value)), ticker ?? ""]}
              />
              <Area
                type="monotone"
                dataKey="p"
                stroke={tone}
                strokeWidth={1.5}
                fill="url(#mainChartFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartArea>
      )}
    </Panel>
  );
}
