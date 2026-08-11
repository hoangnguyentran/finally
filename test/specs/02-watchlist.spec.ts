import { expect, test } from "@playwright/test";
import { openTerminal, watchlistPanel, watchlistRow, watchlistTicker } from "./helpers";

test.describe("watchlist management", () => {
  test("adds a ticker and starts streaming its price", async ({ page }) => {
    await openTerminal(page);

    const before = await watchlistPanel(page).locator("tbody tr").count();

    await watchlistPanel(page).getByLabel("Add ticker").fill("PYPL");
    await watchlistPanel(page).getByRole("button", { name: "ADD", exact: true }).click();

    await expect(watchlistTicker(page, "PYPL")).toBeVisible();
    await expect(watchlistPanel(page).locator("tbody tr")).toHaveCount(before + 1);

    // A newly watched ticker joins the simulator, so it must price up.
    const price = watchlistRow(page, "PYPL").getByTestId("price-cell");
    await expect(price).not.toHaveText("—", { timeout: 30_000 });
    expect(Number((await price.textContent())!.replace(/,/g, ""))).toBeGreaterThan(0);
  });

  test("addition survives a reload", async ({ page }) => {
    await openTerminal(page);
    await expect(watchlistTicker(page, "PYPL")).toBeVisible();
  });

  test("removes a ticker", async ({ page }) => {
    await openTerminal(page);

    const before = await watchlistPanel(page).locator("tbody tr").count();
    await expect(watchlistTicker(page, "PYPL")).toBeVisible();

    await watchlistPanel(page)
      .getByRole("button", { name: "Remove PYPL from watchlist" })
      .click();

    await expect(watchlistTicker(page, "PYPL")).toHaveCount(0);
    await expect(watchlistPanel(page).locator("tbody tr")).toHaveCount(before - 1);
  });

  test("removal survives a reload", async ({ page }) => {
    await openTerminal(page);
    await expect(watchlistTicker(page, "PYPL")).toHaveCount(0);
  });
});
