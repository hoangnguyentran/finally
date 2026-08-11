"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

interface PriceCellProps {
  price: number | null | undefined;
  className?: string;
}

/**
 * Renders a price and flashes green/red for ~500ms whenever it changes.
 * The flash element is re-keyed on each tick so the CSS animation restarts
 * even when consecutive ticks move the same direction.
 */
export function PriceCell({ price, className = "" }: PriceCellProps) {
  const previous = useRef<number | null | undefined>(price);
  const [flash, setFlash] = useState({ className: "", seq: 0 });

  useEffect(() => {
    const before = previous.current;
    previous.current = price;
    if (price == null || before == null || before === price) return;

    setFlash((current) => ({
      className: price > before ? "flash-up" : "flash-down",
      seq: current.seq + 1,
    }));
  }, [price]);

  return (
    <span
      key={flash.seq}
      data-testid="price-cell"
      className={`tnum inline-block rounded-xs px-1 ${flash.className} ${className}`}
    >
      {formatPrice(price)}
    </span>
  );
}
