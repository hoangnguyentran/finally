"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartArea } from "./ChartArea";
import { Panel } from "./Panel";
import { useTotals } from "@/hooks/useTotals";
import { formatClock, formatMoney } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

const AXIS = { stroke: "#6b7683", fontSize: 10, fontFamily: "var(--font-mono)" };

/** Clock for the live data point: the newest tick seen on the price stream. */
function selectLatestTickMs(prices: Record<string, { timestamp: number }>): number {
  let latest = 0;
  for (const update of Object.values(prices)) {
    if (update.timestamp > latest) latest = update.timestamp;
  }
  return latest * 1000;
}

export function PnlChart({ className = "" }: { className?: string }) {
  const snapshots = useAppStore((state) => state.snapshots);
  const latestTickMs = useAppStore((state) => selectLatestTickMs(state.prices));
  const totals = useTotals();

  // Server snapshots land every 30s; append the live value so the right edge
  // of the chart tracks the stream instead of lagging up to half a minute.
  const data = useMemo(() => {
    const historical = snapshots.map((snapshot) => ({
      t: new Date(snapshot.recorded_at).getTime(),
      v: snapshot.total_value,
    }));
    const lastHistorical = historical[historical.length - 1];
    const liveAt = latestTickMs || (lastHistorical ? lastHistorical.t + 1_000 : 0);
    return [...historical, { t: liveAt, v: totals.totalValue }];
  }, [snapshots, latestTickMs, totals.totalValue]);

  const first = data[0]?.v ?? 0;
  const rising = (data[data.length - 1]?.v ?? 0) >= first;
  const tone = rising ? "var(--color-up)" : "var(--color-down)";

  return (
    <Panel title="Portfolio Value" bodyClassName="relative" className={className}>
      {snapshots.length === 0 ? (
        <ChartArea>
          <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">
            No snapshots yet — history builds as you trade
          </div>
        </ChartArea>
      ) : (
        <ChartArea>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
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
                dataKey="v"
                domain={["dataMin - 20", "dataMax + 20"]}
                tickFormatter={(value: number) => `$${Math.round(value).toLocaleString()}`}
                width={62}
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
                formatter={(value) => [formatMoney(Number(value)), "Total"]}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke={tone}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartArea>
      )}
    </Panel>
  );
}
