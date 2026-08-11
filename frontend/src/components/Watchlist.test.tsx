import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Watchlist } from "./Watchlist";
import * as api from "@/lib/api";
import { resetStore } from "@/test/resetStore";
import { useAppStore } from "@/store/useAppStore";
import type { PriceMap } from "@/lib/types";

vi.mock("@/lib/api");

const prices: PriceMap = {
  AAPL: {
    ticker: "AAPL",
    price: 190.5,
    previous_price: 190.1,
    timestamp: 1_700_000_000,
    change: 0.4,
    change_percent: 0.21,
    direction: "up",
  },
  GOOGL: {
    ticker: "GOOGL",
    price: 175.25,
    previous_price: 175.8,
    timestamp: 1_700_000_000,
    change: -0.55,
    change_percent: -0.31,
    direction: "down",
  },
};

describe("Watchlist", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(api.fetchWatchlist).mockResolvedValue([
      { ticker: "AAPL" },
      { ticker: "GOOGL" },
    ]);
    vi.mocked(api.addWatchlistTicker).mockResolvedValue(undefined);
    vi.mocked(api.removeWatchlistTicker).mockResolvedValue(undefined);

    useAppStore.setState({
      watchlist: [{ ticker: "AAPL" }, { ticker: "GOOGL" }],
      prices,
    });
  });

  it("renders each watched ticker with its live price", () => {
    render(<Watchlist />);

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
    expect(screen.getByText("190.50")).toBeInTheDocument();
    expect(screen.getByText("175.25")).toBeInTheDocument();
  });

  it("shows a placeholder sparkline until enough ticks accumulate", () => {
    render(<Watchlist />);
    expect(screen.getAllByTestId("sparkline-empty")).toHaveLength(2);
  });

  it("draws a sparkline once history accumulates from the stream", () => {
    useAppStore.setState({
      history: {
        AAPL: [
          { t: 1_000, p: 190 },
          { t: 1_500, p: 191 },
          { t: 2_000, p: 192 },
        ],
      },
    });

    render(<Watchlist />);

    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    // Session change measured from the first accumulated point: 190 -> 192.
    expect(screen.getByText("+1.05%")).toBeInTheDocument();
  });

  it("adds a ticker and refreshes the list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchWatchlist).mockResolvedValue([
      { ticker: "AAPL" },
      { ticker: "GOOGL" },
      { ticker: "PYPL" },
    ]);

    render(<Watchlist />);
    await user.type(screen.getByLabelText("Add ticker"), "pypl");
    await user.click(screen.getByRole("button", { name: "ADD" }));

    expect(api.addWatchlistTicker).toHaveBeenCalledWith("PYPL");
    expect(await screen.findByText("PYPL")).toBeInTheDocument();
  });

  it("removes a ticker and refreshes the list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchWatchlist).mockResolvedValue([{ ticker: "GOOGL" }]);

    render(<Watchlist />);
    await user.click(screen.getByLabelText("Remove AAPL from watchlist"));

    expect(api.removeWatchlistTicker).toHaveBeenCalledWith("AAPL");
    await waitFor(() => expect(screen.queryByText("AAPL")).not.toBeInTheDocument());
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
  });

  it("surfaces a rejected add without dropping the existing list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.addWatchlistTicker).mockRejectedValue(new Error("Unknown ticker: ZZZZ"));

    render(<Watchlist />);
    await user.type(screen.getByLabelText("Add ticker"), "ZZZZ");
    await user.click(screen.getByRole("button", { name: "ADD" }));

    await waitFor(() =>
      expect(useAppStore.getState().notice).toBe("Unknown ticker: ZZZZ"),
    );
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("selects a ticker when its row is clicked", async () => {
    const user = userEvent.setup();
    render(<Watchlist />);

    const row = screen.getByText("GOOGL").closest("tr")!;
    await user.click(within(row).getByText("GOOGL"));

    expect(useAppStore.getState().selectedTicker).toBe("GOOGL");
  });
});
