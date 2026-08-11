"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { PriceMap } from "@/lib/types";

/**
 * Subscribes to the server's SSE price feed. EventSource reconnects on its own,
 * so error handling only has to translate readyState into a status light.
 */
export function usePriceStream(url = "/api/stream/prices") {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const { applyPrices, setConnection } = useAppStore.getState();
    const source = new EventSource(url);

    source.onopen = () => setConnection("connected");

    source.onmessage = (event: MessageEvent<string>) => {
      try {
        applyPrices(JSON.parse(event.data) as PriceMap);
      } catch {
        return;
      }
      setConnection("connected");
    };

    source.onerror = () => {
      setConnection(
        source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting",
      );
    };

    return () => source.close();
  }, [url]);
}
