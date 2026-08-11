"use client";

import { ChatPanel } from "@/components/ChatPanel";
import { Header } from "@/components/Header";
import { MainChart } from "@/components/MainChart";
import { PnlChart } from "@/components/PnlChart";
import { PortfolioHeatmap } from "@/components/PortfolioHeatmap";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { Watchlist } from "@/components/Watchlist";
import { useBackendSync } from "@/hooks/useBackendSync";
import { usePriceStream } from "@/hooks/usePriceStream";

export default function Terminal() {
  usePriceStream();
  useBackendSync();

  return (
    <div className="flex min-h-screen flex-col xl:h-screen">
      <Header />

      <main className="flex min-h-0 flex-1 flex-col gap-1 p-1 xl:flex-row">
        <Watchlist className="min-h-[280px] shrink-0 xl:w-[290px]" />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <MainChart className="min-h-[300px] flex-[7]" />
          <TradeBar />
          <div className="flex min-h-0 flex-[5] flex-col gap-1 lg:flex-row">
            <PositionsTable className="min-h-[200px] min-w-0 flex-[3]" />
            <PortfolioHeatmap className="min-h-[220px] min-w-0 flex-[2]" />
            <PnlChart className="min-h-[220px] min-w-0 flex-[2]" />
          </div>
        </div>

        <ChatPanel />
      </main>
    </div>
  );
}
