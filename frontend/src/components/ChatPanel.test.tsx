import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import * as api from "@/lib/api";
import { resetStore } from "@/test/resetStore";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/lib/api");

describe("ChatPanel", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(api.fetchPortfolio).mockResolvedValue({ cash_balance: 10_000, positions: [] });
    vi.mocked(api.fetchWatchlist).mockResolvedValue([]);
    vi.mocked(api.fetchHistory).mockResolvedValue([]);
    vi.mocked(api.fetchChatHistory).mockResolvedValue([]);
  });

  it("renders the stored conversation with roles preserved", () => {
    useAppStore.setState({
      chat: [
        { id: "1", role: "user", content: "How is my portfolio doing?" },
        { id: "2", role: "assistant", content: "You are up 2.4% today." },
      ],
    });

    render(<ChatPanel />);

    expect(screen.getByText("How is my portfolio doing?")).toBeInTheDocument();
    expect(screen.getByText("You are up 2.4% today.")).toBeInTheDocument();
  });

  it("shows a loading indicator while the assistant is responding", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { message: string }) => void;
    vi.mocked(api.sendChatMessage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<ChatPanel />);
    await user.type(screen.getByLabelText("Message FinAlly"), "buy 5 NVDA");
    await user.click(screen.getByRole("button", { name: "SEND" }));

    expect(screen.getByText("buy 5 NVDA")).toBeInTheDocument();
    expect(screen.getByText("FinAlly is thinking…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SEND" })).toBeDisabled();

    resolve({ message: "Done." });

    await waitFor(() =>
      expect(screen.queryByText("FinAlly is thinking…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });

  it("renders executed trades and watchlist changes inline", async () => {
    const user = userEvent.setup();
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      message: "Bought NVDA and added PYPL.",
      trades: [{ ticker: "NVDA", side: "buy", quantity: 5, price: 120.5 }],
      watchlist_changes: [{ ticker: "PYPL", action: "add" }],
    });

    render(<ChatPanel />);
    await user.type(screen.getByLabelText("Message FinAlly"), "buy 5 NVDA and watch PYPL");
    await user.click(screen.getByRole("button", { name: "SEND" }));

    expect(await screen.findByText(/BUY 5 NVDA @ 120.50/)).toBeInTheDocument();
    expect(screen.getByText(/Watchlist \+ PYPL/)).toBeInTheDocument();
  });

  it("shows an error chip when a requested trade was rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      message: "That trade did not go through.",
      trades: [
        { ticker: "AAPL", side: "buy", quantity: 1000, error: "Insufficient cash" },
      ],
    });

    render(<ChatPanel />);
    await user.type(screen.getByLabelText("Message FinAlly"), "buy 1000 AAPL");
    await user.click(screen.getByRole("button", { name: "SEND" }));

    expect(
      await screen.findByText(/BUY AAPL failed — Insufficient cash/),
    ).toBeInTheDocument();
  });

  it("reports a failed request as an assistant message instead of hanging", async () => {
    const user = userEvent.setup();
    vi.mocked(api.sendChatMessage).mockRejectedValue(new Error("Request failed (503)"));

    render(<ChatPanel />);
    await user.type(screen.getByLabelText("Message FinAlly"), "hello");
    await user.click(screen.getByRole("button", { name: "SEND" }));

    expect(await screen.findByText("Request failed (503)")).toBeInTheDocument();
    expect(screen.queryByText("FinAlly is thinking…")).not.toBeInTheDocument();
  });

  it("refreshes portfolio state after the assistant acts", async () => {
    const user = userEvent.setup();
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      message: "Done.",
      trades: [{ ticker: "NVDA", side: "buy", quantity: 5 }],
    });

    render(<ChatPanel />);
    await user.type(screen.getByLabelText("Message FinAlly"), "buy NVDA");
    await user.click(screen.getByRole("button", { name: "SEND" }));

    await waitFor(() => expect(api.fetchPortfolio).toHaveBeenCalled());
  });

  it("collapses and reopens the sidebar", async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);

    await user.click(screen.getByLabelText("Collapse AI assistant"));
    expect(screen.queryByLabelText("Message FinAlly")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Expand AI assistant"));
    expect(screen.getByLabelText("Message FinAlly")).toBeInTheDocument();
  });
});
