import type { PricePoint } from "@/lib/types";

interface SparklineProps {
  points: PricePoint[];
  width?: number;
  height?: number;
  /** Accessible label; the drawing itself is decorative. */
  label?: string;
}

export function Sparkline({ points, width = 76, height = 22, label }: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label ? `${label} sparkline, collecting data` : undefined}
        data-testid="sparkline-empty"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-edge)"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const values = points.map((point) => point.p);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const usable = height - pad * 2;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = pad + (1 - (point.p - min) / span) * usable;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const rising = values[values.length - 1] >= values[0];
  const stroke = rising ? "var(--color-up)" : "var(--color-down)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ? `${label} sparkline` : undefined}
      data-testid="sparkline"
    >
      <polygon
        points={`0,${height} ${coords.join(" ")} ${width},${height}`}
        fill={stroke}
        opacity={0.12}
      />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
