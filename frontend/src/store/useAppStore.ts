"use client";

import { create } from "zustand";
import * as api from "@/lib/api";
import type {
  ChatMessage,
  Portfolio,
  PriceMap,
  PricePoint,
  Snapshot,
  TradeSide,
  WatchlistItem,
} from "@/lib/types";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

/** Points retained per ticker for the main chart; sparklines use the tail. */
export const HISTORY_LIMIT = 600;
export const SPARKLINE_POINTS = 60;

interface AppState {
  prices: PriceMap;
  history: Record<string, PricePoint[]>;
  connection: ConnectionStatus;
  selectedTicker: string | null;

  watchlist: WatchlistItem[];
  portfolio: Portfolio | null;
  snapshots: Snapshot[];
  chat: ChatMessage[];
  chatPending: boolean;
  notice: string | null;

  applyPrices: (incoming: PriceMap) => void;
  setConnection: (status: ConnectionStatus) => void;
  selectTicker: (ticker: string) => void;
  setNotice: (notice: string | null) => void;

  refreshPortfolio: () => Promise<void>;
  refreshWatchlist: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshChat: () => Promise<void>;
  refreshAll: () => Promise<void>;

  addTicker: (ticker: string) => Promise<void>;
  removeTicker: (ticker: string) => Promise<void>;
  trade: (ticker: string, quantity: number, side: TradeSide) => Promise<boolean>;
  sendChat: (message: string) => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

let messageCounter = 0;
const nextMessageId = () => `m${++messageCounter}`;

export const useAppStore = create<AppState>((set, get) => ({
  prices: {},
  history: {},
  connection: "reconnecting",
  selectedTicker: null,

  watchlist: [],
  portfolio: null,
  snapshots: [],
  chat: [],
  chatPending: false,
  notice: null,

  applyPrices: (incoming) =>
    set((state) => {
      const history = { ...state.history };

      for (const [ticker, update] of Object.entries(incoming)) {
        const series = history[ticker] ?? [];
        const last = series[series.length - 1];
        // The stream re-sends every ticker on each event; only extend the
        // series when this ticker actually ticked, or the chart fills with
        // duplicate flat points.
        if (last && last.t === update.timestamp * 1000) continue;

        const next = [...series, { t: update.timestamp * 1000, p: update.price }];
        history[ticker] = next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
      }

      return {
        prices: { ...state.prices, ...incoming },
        history,
        selectedTicker: state.selectedTicker ?? Object.keys(incoming)[0] ?? null,
      };
    }),

  setConnection: (connection) => set({ connection }),
  selectTicker: (selectedTicker) => set({ selectedTicker }),
  setNotice: (notice) => set({ notice }),

  refreshPortfolio: async () => {
    set({ portfolio: await api.fetchPortfolio() });
  },

  refreshWatchlist: async () => {
    const watchlist = await api.fetchWatchlist();
    set((state) => ({
      watchlist,
      selectedTicker: state.selectedTicker ?? watchlist[0]?.ticker ?? null,
    }));
  },

  refreshHistory: async () => {
    set({ snapshots: await api.fetchHistory() });
  },

  refreshChat: async () => {
    set({ chat: await api.fetchChatHistory() });
  },

  refreshAll: async () => {
    // refreshChat is deliberately not part of this list: it's called once on
    // mount to rehydrate history, not on every refreshAll (which also runs
    // after each chat turn) — otherwise a slow or empty fetch here would
    // clobber the optimistic message that sendChat just appended.
    const results = await Promise.allSettled([
      get().refreshPortfolio(),
      get().refreshWatchlist(),
      get().refreshHistory(),
    ]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure && failure.status === "rejected") {
      set({ notice: `Backend unavailable: ${messageOf(failure.reason)}` });
    }
  },

  addTicker: async (rawTicker) => {
    const ticker = rawTicker.trim().toUpperCase();
    if (!ticker) return;
    try {
      await api.addWatchlistTicker(ticker);
      await get().refreshWatchlist();
      set({ selectedTicker: ticker, notice: null });
    } catch (error) {
      set({ notice: messageOf(error) });
    }
  },

  removeTicker: async (ticker) => {
    try {
      await api.removeWatchlistTicker(ticker);
      await get().refreshWatchlist();
      set((state) => ({
        notice: null,
        selectedTicker:
          state.selectedTicker === ticker
            ? (state.watchlist.find((w) => w.ticker !== ticker)?.ticker ?? null)
            : state.selectedTicker,
      }));
    } catch (error) {
      set({ notice: messageOf(error) });
    }
  },

  trade: async (rawTicker, quantity, side) => {
    const ticker = rawTicker.trim().toUpperCase();
    try {
      await api.executeTrade({ ticker, quantity, side });
      await Promise.all([get().refreshPortfolio(), get().refreshHistory()]);
      set({ notice: `${side === "buy" ? "Bought" : "Sold"} ${quantity} ${ticker}` });
      return true;
    } catch (error) {
      set({ notice: messageOf(error) });
      return false;
    }
  },

  sendChat: async (content) => {
    const trimmed = content.trim();
    if (!trimmed || get().chatPending) return;

    set((state) => ({
      chat: [...state.chat, { id: nextMessageId(), role: "user", content: trimmed }],
      chatPending: true,
    }));

    try {
      const response = await api.sendChatMessage(trimmed);
      set((state) => ({
        chat: [
          ...state.chat,
          {
            id: nextMessageId(),
            role: "assistant",
            content: response.message,
            trades: response.trades,
            watchlist_changes: response.watchlist_changes,
          },
        ],
        chatPending: false,
      }));

      // The assistant may have traded or edited the watchlist on our behalf.
      await get().refreshAll();
    } catch (error) {
      set((state) => ({
        chat: [
          ...state.chat,
          {
            id: nextMessageId(),
            role: "assistant",
            content: messageOf(error),
            failed: true,
          },
        ],
        chatPending: false,
      }));
    }
  },
}));
