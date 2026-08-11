import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { resetStore } from "@/test/resetStore";
import { HISTORY_LIMIT, useAppStore } from "./useAppStore";
import type { PriceMap } from "@/lib/types";

vi.mock("@/lib/api");

function tick(ticker: string, price: number, timestamp: number): PriceMap {
  return {
    [ticker]: {
      ticker,
      price,
      previous_price: price,
      timestamp,
      change: 0,
      change_percent: 0,
      direction: "flat",
    },
  };
}

describe("useAppStore", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(api.fetchPortfolio).mockResolvedValue({ cash_balance: 9_000, positions: [] });
    vi.mocked(api.fetchWatchlist).mockResolvedValue([]);
    vi.mocked(api.fetchHistory).mockResolvedValue([]);
    vi.mocked(api.fetchChatHistory).mockResolvedValue([]);
  });

  it("accumulates price history from the stream", () => {
    const { applyPrices } = useAppStore.getState();
    applyPrices(tick("AAPL", 190, 1_000));
    applyPrices(tick("AAPL", 191, 1_001));

    expect(useAppStore.getState().history.AAPL).toEqual([
      { t: 1_000_000, p: 190 },
      { t: 1_001_000, p: 191 },
    ]);
  });

  it("ignores repeated events carrying the same timestamp", () => {
    const { applyPrices } = useAppStore.getState();
    applyPrices(tick("AAPL", 190, 1_000));
    applyPrices(tick("AAPL", 190, 1_000));

    expect(useAppStore.getState().history.AAPL).toHaveLength(1);
  });

  it("caps each series so long sessions do not grow without bound", () => {
    const { applyPrices } = useAppStore.getState();
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
      applyPrices(tick("AAPL", 190 + i, 1_000 + i));
    }

    const series = useAppStore.getState().history.AAPL;
    expect(series).toHaveLength(HISTORY_LIMIT);
    expect(series[series.length - 1].p).toBe(190 + HISTORY_LIMIT + 24);
  });

  it("auto-selects the first streamed ticker", () => {
    useAppStore.getState().applyPrices(tick("MSFT", 400, 1_000));
    expect(useAppStore.getState().selectedTicker).toBe("MSFT");
  });

  it("refreshes the portfolio after a successful trade", async () => {
    vi.mocked(api.executeTrade).mockResolvedValue(undefined);

    const ok = await useAppStore.getState().trade("aapl", 3, "buy");

    expect(ok).toBe(true);
    expect(api.executeTrade).toHaveBeenCalledWith({
      ticker: "AAPL",
      quantity: 3,
      side: "buy",
    });
    expect(useAppStore.getState().portfolio?.cash_balance).toBe(9_000);
    expect(useAppStore.getState().notice).toBe("Bought 3 AAPL");
  });

  it("reports a rejected trade without touching portfolio state", async () => {
    vi.mocked(api.executeTrade).mockRejectedValue(new Error("Insufficient cash"));

    const ok = await useAppStore.getState().trade("AAPL", 1000, "buy");

    expect(ok).toBe(false);
    expect(api.fetchPortfolio).not.toHaveBeenCalled();
    expect(useAppStore.getState().notice).toBe("Insufficient cash");
  });

  it("notes when the backend is unreachable during startup", async () => {
    vi.mocked(api.fetchPortfolio).mockRejectedValue(new Error("Failed to fetch"));

    await useAppStore.getState().refreshAll();

    expect(useAppStore.getState().notice).toContain("Backend unavailable");
  });
});
