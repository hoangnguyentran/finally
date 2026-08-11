import { expect, test } from "@playwright/test";
import {
  heatmapPanel,
  openTerminal,
  pnlPanel,
  positionCell,
  positionRow,
  submitTrade,
} from "./helpers";

test.describe("portfolio visualisations", () => {
  test("heatmap renders a cell per position and the P&L chart gains data", async ({ page }) => {
    await openTerminal(page);

    await submitTrade(page, "GOOGL", 3, "BUY");
    await expect(positionCell(page, "GOOGL")).toBeVisible();

    // Treemap replaces the placeholder and labels the position.
    await expect(heatmapPanel(page).getByText("No positions yet")).toHaveCount(0);
    const treemap = heatmapPanel(page).locator("svg.recharts-surface");
    await expect(treemap).toBeVisible();
    await expect(treemap.locator("text", { hasText: "GOOGL" })).toBeVisible();

    // A trade writes a snapshot immediately (PLAN.md section 7), so the P&L
    // chart must have a plotted series rather than the empty-state message.
    await expect(pnlPanel(page).getByText(/No snapshots yet/)).toHaveCount(0);
    await expect(pnlPanel(page).locator("svg.recharts-surface")).toBeVisible();
    await expect(pnlPanel(page).locator("path.recharts-line-curve")).toHaveAttribute(
      "d",
      /^M/,
    );

    // A second position gives the treemap a second labelled cell.
    await submitTrade(page, "JPM", 2, "BUY");
    await expect(positionCell(page, "JPM")).toBeVisible();
    await expect(treemap.locator("text", { hasText: "JPM" })).toBeVisible();
    await expect(treemap.locator("text", { hasText: "GOOGL" })).toBeVisible();
  });

  test("positions table reports live P&L columns", async ({ page }) => {
    await openTerminal(page);

    const row = positionRow(page, "GOOGL");
    await expect(row).toBeVisible();

    const cells = row.locator("td");
    await expect(cells).toHaveCount(7);
    await expect(cells.nth(1)).toHaveText("3");
    // Avg cost, live price and market value are all real numbers.
    for (const index of [2, 3, 4]) {
      const value = Number((await cells.nth(index).textContent())!.replace(/[$,]/g, ""));
      expect(value).toBeGreaterThan(0);
    }
    // Unrealised P&L and % are signed values, not placeholders.
    await expect(cells.nth(5)).toHaveText(/^[+-]\$[\d,]+\.\d{2}$/);
    await expect(cells.nth(6)).toHaveText(/^[+-]\d+\.\d{2}%$/);
  });
});
