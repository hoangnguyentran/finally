"use client";

import { useMemo } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { ChartArea } from "./ChartArea";
import { Panel } from "./Panel";
import { useTotals } from "@/hooks/useTotals";
import { formatPercent } from "@/lib/format";

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
}

/** Saturation ramps with the size of the move, capped at ±5%. */
function pnlColor(pnlPercent: number): string {
  const intensity = Math.min(Math.abs(pnlPercent) / 5, 1);
  const base = pnlPercent >= 0 ? "var(--color-up)" : "var(--color-down)";
  return `color-mix(in srgb, ${base} ${(18 + intensity * 62).toFixed(0)}%, #131a24)`;
}

function makeCell(pnlByTicker: Map<string, number>) {
  return function Cell({ x = 0, y = 0, width = 0, height = 0, name = "" }: CellProps) {
    const pnlPercent = pnlByTicker.get(name) ?? 0;
    const showLabel = width > 42 && height > 26;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={pnlColor(pnlPercent)}
          stroke="#0d1117"
          strokeWidth={2}
        />
        {showLabel && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 4}
              textAnchor="middle"
              fill="#e6edf3"
              fontSize={11}
              fontWeight={600}
            >
              {name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 10}
              textAnchor="middle"
              fill="#e6edf3"
              fontSize={10}
              fontFamily="var(--font-mono)"
              opacity={0.85}
            >
              {formatPercent(pnlPercent)}
            </text>
          </>
        )}
      </g>
    );
  };
}

export function PortfolioHeatmap({ className = "" }: { className?: string }) {
  const totals = useTotals();

  const { data, pnlByTicker } = useMemo(() => {
    const held = totals.positions.filter((position) => position.marketValue > 0);
    return {
      data: held.map((position) => ({ name: position.ticker, size: position.marketValue })),
      pnlByTicker: new Map(held.map((p) => [p.ticker, p.unrealizedPnlPercent])),
    };
  }, [totals.positions]);

  return (
    <Panel title="Allocation Heatmap" bodyClassName="relative" className={className}>
      {data.length === 0 ? (
        <ChartArea>
          <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">
            No positions yet
          </div>
        </ChartArea>
      ) : (
        <ChartArea>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey="size"
              nameKey="name"
              isAnimationActive={false}
              content={makeCell(pnlByTicker) as never}
            />
          </ResponsiveContainer>
        </ChartArea>
      )}
    </Panel>
  );
}
