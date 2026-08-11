import { expect, test } from "@playwright/test";
import {
  chatPanel,
  openTerminal,
  positionCell,
  readCash,
  readPositionQuantity,
  sendChat,
  watchlistTicker,
} from "./helpers";

/**
 * The app runs with LLM_MOCK=true, so these phrasings map to deterministic
 * structured responses (backend/app/llm/mock.py). Tickers must be uppercase.
 */
test.describe("AI chat assistant", () => {
  test("answers a conversational question with no actions", async ({ page }) => {
    await openTerminal(page);

    await sendChat(page, "how is my portfolio doing?");

    const chat = chatPanel(page);
    await expect(chat.getByText("how is my portfolio doing?")).toBeVisible();
    await expect(chat.getByText(/^Your portfolio is currently worth \$[\d,]+\.\d{2}\.$/)).toBeVisible();
  });

  test("executes a buy and shows it inline as a confirmation chip", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    await sendChat(page, "buy 5 AAPL");

    const chat = chatPanel(page);
    await expect(chat.getByText("Buying 5 AAPL at the current market price.")).toBeVisible();
    await expect(chat.getByText(/^BUY 5 AAPL @ [\d,]+\.\d{2}$/)).toBeVisible();

    // The chat action really moved the portfolio, not just the transcript.
    await expect(positionCell(page, "AAPL")).toBeVisible();
    await expect.poll(() => readPositionQuantity(page, "AAPL")).toBe(5);
    await expect.poll(() => readCash(page)).toBeLessThan(cashBefore);
  });

  test("executes a sell against the position it just opened", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    await sendChat(page, "sell 2 AAPL");

    const chat = chatPanel(page);
    await expect(chat.getByText("Selling 2 AAPL at the current market price.")).toBeVisible();
    await expect(chat.getByText(/^SELL 2 AAPL @ [\d,]+\.\d{2}$/)).toBeVisible();

    await expect.poll(() => readPositionQuantity(page, "AAPL")).toBe(3);
    await expect.poll(() => readCash(page)).toBeGreaterThan(cashBefore);
  });

  test("renders a failed trade inline as an error without breaking the page", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    const quantityBefore = await readPositionQuantity(page, "AAPL");

    await sendChat(page, "buy 5000 AAPL");

    const chat = chatPanel(page);
    await expect(chat.getByText(/^BUY AAPL failed — .+/)).toBeVisible();
    await expect(chat.getByText(/Insufficient cash/)).toBeVisible();

    // The books are untouched and the terminal is still usable.
    expect(await readCash(page)).toBe(cashBefore);
    expect(await readPositionQuantity(page, "AAPL")).toBe(quantityBefore);
    await expect(chat.getByLabel("Message FinAlly")).toBeEditable();

    await sendChat(page, "how is my portfolio doing?");
    await expect(
      chat.getByText(/^Your portfolio is currently worth \$[\d,]+\.\d{2}\.$/).last(),
    ).toBeVisible();
  });

  test("adds and removes watchlist tickers on request", async ({ page }) => {
    await openTerminal(page);

    await sendChat(page, "add PYPL to my watchlist");
    await expect(chatPanel(page).getByText("Adding PYPL to your watchlist.")).toBeVisible();
    await expect(chatPanel(page).getByText(/^Watchlist \+ PYPL$/)).toBeVisible();
    await expect(watchlistTicker(page, "PYPL")).toBeVisible();

    await sendChat(page, "remove NFLX from my watchlist");
    await expect(chatPanel(page).getByText("Removing NFLX from your watchlist.")).toBeVisible();
    // The separator is a typographic minus, so match it loosely.
    await expect(chatPanel(page).getByText(/^Watchlist \S NFLX$/)).toBeVisible();
    await expect(watchlistTicker(page, "NFLX")).toHaveCount(0);
  });
});
