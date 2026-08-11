import { expect, test } from "@playwright/test";
import {
  connectionDot,
  expectPricesToTick,
  openTerminal,
  waitForLiveStream,
  watchlistPanel,
} from "./helpers";

test.describe("SSE resilience", () => {
  test("reconnects and resumes streaming after a reload", async ({ page }) => {
    await openTerminal(page);
    await expectPricesToTick(page);

    await page.reload();

    // EventSource is re-created on mount; the indicator must return to green
    // rather than sticking on reconnecting/disconnected.
    await waitForLiveStream(page);
    await expect(connectionDot(page)).toHaveAttribute("data-status", "connected");
    await expectPricesToTick(page);
  });

  test("recovers after the tab is backgrounded and restored", async ({ page, context }) => {
    await openTerminal(page);

    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    await page.waitForTimeout(3_000);
    await page.bringToFront();
    await other.close();

    await expect(connectionDot(page)).toHaveAttribute("data-status", "connected");
    await expectPricesToTick(page);
  });

  test("client-side navigation keeps a single live stream", async ({ page }) => {
    await openTerminal(page);

    // Two tabs on the same app must both stream — the price cache is shared and
    // each EventSource is independent.
    const second = await page.context().newPage();
    await second.goto("/");
    await waitForLiveStream(second);

    await expectPricesToTick(second);
    await expectPricesToTick(page);

    await expect(watchlistPanel(second).locator("tbody tr")).not.toHaveCount(0);
    await second.close();

    await expect(connectionDot(page)).toHaveAttribute("data-status", "connected");
  });
});
