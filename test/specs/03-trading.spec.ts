import { expect, test } from "@playwright/test";
import {
  openTerminal,
  positionCell,
  positionsPanel,
  readCash,
  readPositionQuantity,
  readPositionsValue,
  submitTrade,
} from "./helpers";

test.describe("trading via the trade bar", () => {
  test("buying decreases cash and opens a position", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    expect(cashBefore).toBeGreaterThan(0);

    await submitTrade(page, "AAPL", 2, "BUY");

    await expect(page.getByText("Bought 2 AAPL")).toBeVisible();
    await expect(positionCell(page, "AAPL")).toBeVisible();
    expect(await readPositionQuantity(page, "AAPL")).toBe(2);

    // Cash is only ever moved by a trade, so this is a stable comparison even
    // though prices tick underneath.
    await expect.poll(() => readCash(page)).toBeLessThan(cashBefore);
    await expect.poll(() => readPositionsValue(page)).toBeGreaterThan(0);

    // Roughly two shares' worth of cash left the account.
    const spent = cashBefore - (await readCash(page));
    expect(spent).toBeGreaterThan(100);
    expect(spent).toBeLessThan(1000);
  });

  test("buying more of the same ticker adds to the position", async ({ page }) => {
    await openTerminal(page);
    await expect(positionCell(page, "AAPL")).toBeVisible();

    await submitTrade(page, "AAPL", 1, "BUY");

    await expect(page.getByText("Bought 1 AAPL")).toBeVisible();
    await expect.poll(() => readPositionQuantity(page, "AAPL")).toBe(3);
    await expect(positionsPanel(page).locator("tbody tr")).toHaveCount(1);
  });

  test("partially selling increases cash and reduces the position", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    await submitTrade(page, "AAPL", 1, "SELL");

    await expect(page.getByText("Sold 1 AAPL")).toBeVisible();
    await expect.poll(() => readPositionQuantity(page, "AAPL")).toBe(2);
    await expect.poll(() => readCash(page)).toBeGreaterThan(cashBefore);
  });

  test("selling the full position removes the row", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    const quantity = await readPositionQuantity(page, "AAPL");
    expect(quantity).toBeGreaterThan(0);

    await submitTrade(page, "AAPL", quantity, "SELL");

    await expect(page.getByText(`Sold ${quantity} AAPL`)).toBeVisible();
    await expect(positionCell(page, "AAPL")).toHaveCount(0);
    await expect(positionsPanel(page).getByText(/No open positions/)).toBeVisible();
    await expect.poll(() => readCash(page)).toBeGreaterThan(cashBefore);
  });

  test("rejects a sell with no shares and an unaffordable buy", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);

    // NFLX and NVDA are never traded by any spec, so a position appearing for
    // either of them means a rejected order leaked through.
    await submitTrade(page, "NFLX", 5, "SELL");
    // The backend renders the quantity as a float ("5.0"); accept either form.
    await expect(page.getByText(/^Insufficient shares: cannot sell 5(\.0)? NFLX/)).toBeVisible();
    await expect(positionCell(page, "NFLX")).toHaveCount(0);

    await submitTrade(page, "NVDA", 100000, "BUY");
    await expect(page.getByText(/^Insufficient cash: trade costs/)).toBeVisible();
    await expect(positionCell(page, "NVDA")).toHaveCount(0);

    // A rejected order must not move the books.
    expect(await readCash(page)).toBe(cashBefore);
  });

  test("trades persist across a reload", async ({ page }) => {
    await openTerminal(page);

    const cashBefore = await readCash(page);
    await submitTrade(page, "MSFT", 1, "BUY");
    await expect(positionCell(page, "MSFT")).toBeVisible();

    await page.reload();
    await openTerminal(page);

    await expect(positionCell(page, "MSFT")).toBeVisible();
    expect(await readPositionQuantity(page, "MSFT")).toBe(1);
    expect(await readCash(page)).toBeLessThan(cashBefore);

    // Clean up so later specs start from a known position set.
    await submitTrade(page, "MSFT", 1, "SELL");
    await expect(positionCell(page, "MSFT")).toHaveCount(0);
  });
});
