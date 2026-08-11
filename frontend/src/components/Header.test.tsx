import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import { resetStore } from "@/test/resetStore";
import { useAppStore, type ConnectionStatus } from "@/store/useAppStore";

vi.mock("@/lib/api");

describe("Header", () => {
  beforeEach(resetStore);

  it.each<[ConnectionStatus, string]>([
    ["connected", "Live"],
    ["reconnecting", "Reconnecting"],
    ["disconnected", "Disconnected"],
  ])("reflects the %s stream state", (connection, label) => {
    useAppStore.setState({ connection });
    render(<Header />);

    expect(screen.getByTestId("connection-dot")).toHaveAttribute("data-status", connection);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows cash and total value driven by live prices", () => {
    useAppStore.setState({
      portfolio: {
        cash_balance: 8_100,
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

    render(<Header />);

    expect(screen.getByText("$8,100.00")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
    expect(screen.getByText("$10,100.00")).toBeInTheDocument();
    expect(screen.getByText(/\+\$100\.00/)).toBeInTheDocument();
  });
});
