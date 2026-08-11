"use client";

import { useMemo } from "react";
import { computeTotals } from "@/lib/portfolio";
import { useAppStore } from "@/store/useAppStore";

export function useTotals() {
  const portfolio = useAppStore((state) => state.portfolio);
  const prices = useAppStore((state) => state.prices);
  return useMemo(() => computeTotals(portfolio, prices), [portfolio, prices]);
}
