import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PositionsTable } from "./PositionsTable";
import { resetStore } from "@/test/resetStore";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/lib/api");

describe("PositionsTable", () => {
  beforeEach(resetStore);

  it("prompts the user when there are no holdings", () => {
    render(<PositionsTable />);
    expect(screen.getByText(/No open positions/)).toBeInTheDocument();
  });

  it("displays derived P&L against the live price", () => {
    useAppStore.setState({
      portfolio: {
        cash_balance: 5_000,
        positions: [{ ticker: "AAPL", quantity: 10, avg_cost: 190 }],
      },
      prices: {
        AAPL: {
          ticker: "AAPL",
          price: 200,
          previous_price: 199,
          timestamp: 1_700_000_000,
          change: 1,
          change_percent: 0.5,
          direction: "up",
        },
      },
    });

    render(<PositionsTable />);
    const row = screen.getByText("AAPL").closest("tr")!;

    expect(within(row).getByText("10")).toBeInTheDocument();
    expect(within(row).getByText("190.00")).toBeInTheDocument();
    expect(within(row).getByText("200.00")).toBeInTheDocument();
    expect(within(row).getByText("$2,000.00")).toBeInTheDocument();
    expect(within(row).getByText("+$100.00")).toBeInTheDocument();
    expect(within(row).getByText("+5.26%")).toBeInTheDocument();
  });

  it("marks losing positions with a negative P&L", () => {
    useAppStore.setState({
      portfolio: {
        cash_balance: 0,
        positions: [{ ticker: "TSLA", quantity: 4, avg_cost: 250 }],
      },
      prices: {
        TSLA: {
          ticker: "TSLA",
          price: 200,
          previous_price: 205,
          timestamp: 1_700_000_000,
          change: -5,
          change_percent: -2.4,
          direction: "down",
        },
      },
    });

    render(<PositionsTable />);
    const row = screen.getByText("TSLA").closest("tr")!;

    expect(within(row).getByText("-$200.00")).toBeInTheDocument();
    expect(within(row).getByText("-20.00%")).toBeInTheDocument();
  });
});
