"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/** Portfolio snapshots are written server-side every 30s. */
const HISTORY_POLL_MS = 30_000;

export function useBackendSync() {
  useEffect(() => {
    const { refreshAll, refreshHistory, refreshChat } = useAppStore.getState();
    void refreshAll();
    // Rehydrate chat history once, on mount only — see the comment on
    // refreshAll for why this isn't folded into that call.
    void refreshChat().catch(() => undefined);

    const timer = setInterval(() => {
      void refreshHistory().catch(() => undefined);
    }, HISTORY_POLL_MS);

    return () => clearInterval(timer);
  }, []);
}
