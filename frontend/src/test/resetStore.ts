import { useAppStore } from "@/store/useAppStore";

/** Clears all streamed and fetched data so each test starts from a fresh terminal. */
export function resetStore() {
  useAppStore.setState({
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
  });
}
