import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeBar } from "./TradeBar";
import * as api from "@/lib/api";
import { resetStore } from "@/test/resetStore";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/lib/api");

describe("TradeBar", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(api.executeTrade).mockResolvedValue(undefined);
    vi.mocked(api.fetchPortfolio).mockResolvedValue({ cash_balance: 8_000, positions: [] });
    vi.mocked(api.fetchHistory).mockResolvedValue([]);
  });

  it("prefills the ticker from the current selection", () => {
    useAppStore.setState({ selectedTicker: "AAPL" });
    render(<TradeBar />);

    expect(screen.getByLabelText("Trade ticker")).toHaveValue("AAPL");
  });

  it("follows a new selection but keeps what the trader typed", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedTicker: "AAPL" });
    render(<TradeBar />);

    const field = screen.getByLabelText("Trade ticker");
    await user.clear(field);
    await user.type(field, "MSFT");
    expect(field).toHaveValue("MSFT");

    useAppStore.setState({ selectedTicker: "TSLA" });
    await waitFor(() => expect(field).toHaveValue("TSLA"));
  });

  it("submits a market buy", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedTicker: "AAPL" });
    render(<TradeBar />);

    const quantity = screen.getByLabelText("Trade quantity");
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.click(screen.getByRole("button", { name: "BUY" }));

    expect(api.executeTrade).toHaveBeenCalledWith({
      ticker: "AAPL",
      quantity: 3,
      side: "buy",
    });
  });

  it("submits a market sell", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedTicker: "TSLA" });
    render(<TradeBar />);

    await user.click(screen.getByRole("button", { name: "SELL" }));

    expect(api.executeTrade).toHaveBeenCalledWith({
      ticker: "TSLA",
      quantity: 1,
      side: "sell",
    });
  });

  it("blocks submission for a non-positive quantity", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ selectedTicker: "AAPL" });
    render(<TradeBar />);

    const quantity = screen.getByLabelText("Trade quantity");
    await user.clear(quantity);
    await user.type(quantity, "0");

    expect(screen.getByRole("button", { name: "BUY" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "SELL" })).toBeDisabled();
  });

  it("surfaces a rejected order", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeTrade).mockRejectedValue(new Error("Insufficient cash"));
    useAppStore.setState({ selectedTicker: "AAPL" });
    render(<TradeBar />);

    await user.click(screen.getByRole("button", { name: "BUY" }));

    expect(await screen.findByText("Insufficient cash")).toBeInTheDocument();
  });
});
