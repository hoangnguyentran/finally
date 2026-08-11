import { expect, test } from "@playwright/test";
import {
  DEFAULT_TICKERS,
  STARTING_CASH,
  chatPanel,
  connectionDot,
  expectPricesToTick,
  heatmapPanel,
  openTerminal,
  pnlPanel,
  positionsPanel,
  readCash,
  readTotalValue,
  watchlistPanel,
  watchlistTicker,
} from "./helpers";

/**
 * Runs first (filename order, single worker) so it sees the freshly seeded
 * tmpfs database before any other spec trades against it.
 */
test.describe("fresh start", () => {
  test("seeded watchlist, $10k cash, and a live price stream", async ({ page }) => {
    await openTerminal(page);

    // All ten seeded tickers are present.
    for (const ticker of DEFAULT_TICKERS) {
      await expect(watchlistTicker(page, ticker)).toBeVisible();
    }
    await expect(watchlistPanel(page).locator("tbody tr")).toHaveCount(DEFAULT_TICKERS.length);

    // Untouched portfolio: full starting cash, nothing invested.
    expect(await readCash(page)).toBe(STARTING_CASH);
    await expect(positionsPanel(page).getByText(/No open positions/)).toBeVisible();
    await expect(heatmapPanel(page).getByText("No positions yet")).toBeVisible();
    expect(await readTotalValue(page)).toBe(STARTING_CASH);

    // The stream is live and prices are real numbers, not placeholders.
    await expect(connectionDot(page)).toHaveAttribute("data-status", "connected");
    const prices = await watchlistPanel(page).getByTestId("price-cell").allTextContents();
    expect(prices).toHaveLength(DEFAULT_TICKERS.length);
    for (const price of prices) {
      expect(Number(price.replace(/,/g, ""))).toBeGreaterThan(0);
    }

    // ...and they move.
    await expectPricesToTick(page);
  });

  test("all terminal panels render", async ({ page }) => {
    await openTerminal(page);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(watchlistPanel(page)).toBeVisible();
    await expect(positionsPanel(page)).toBeVisible();
    await expect(heatmapPanel(page)).toBeVisible();
    await expect(pnlPanel(page)).toBeVisible();
    await expect(chatPanel(page)).toBeVisible();

    // Trade bar controls.
    await expect(page.getByLabel("Trade ticker")).toBeVisible();
    await expect(page.getByLabel("Trade quantity")).toBeVisible();
    await expect(page.getByRole("button", { name: "BUY", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "SELL", exact: true })).toBeEnabled();

    // Main chart follows the selected ticker; selection defaults to the first row.
    await expect(page.getByRole("region", { name: /· Session$/ })).toBeVisible();

    // Sparklines accumulate from the stream rather than shipping with history.
    await expect(
      watchlistPanel(page).locator('[data-testid="sparkline"], [data-testid="sparkline-empty"]'),
    ).toHaveCount(DEFAULT_TICKERS.length);
  });

  test("selecting a ticker drives the main chart", async ({ page }) => {
    await openTerminal(page);

    await watchlistTicker(page, "TSLA").click();
    await expect(page.getByRole("region", { name: "TSLA · Session" })).toBeVisible();
    // Selection also primes the order ticket.
    await expect(page.getByLabel("Trade ticker")).toHaveValue("TSLA");
  });
});
