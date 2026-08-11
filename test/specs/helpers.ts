import { expect, type Locator, type Page } from "@playwright/test";

/** Seeded watchlist from PLAN.md section 7. */
export const DEFAULT_TICKERS = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "JPM",
  "V",
  "NFLX",
] as const;

export const STARTING_CASH = 10_000;

// --- Region locators ------------------------------------------------------
// Every panel is a <section aria-label="…">, which maps to role=region.

export const watchlistPanel = (page: Page) => page.getByRole("region", { name: "Watchlist" });
export const positionsPanel = (page: Page) => page.getByRole("region", { name: "Positions" });
export const heatmapPanel = (page: Page) =>
  page.getByRole("region", { name: "Allocation Heatmap" });
export const pnlPanel = (page: Page) => page.getByRole("region", { name: "Portfolio Value" });
export const chatPanel = (page: Page) => page.getByRole("region", { name: "AI assistant" });
export const connectionDot = (page: Page) => page.getByTestId("connection-dot");

/**
 * A header readout renders as `<div><span>Label</span><span>value</span></div>`.
 * The label is uppercased with CSS, so match case-insensitively on the DOM text
 * and step to the value beside it.
 */
export function headerReadout(page: Page, label: string): Locator {
  return page
    .getByRole("banner")
    .getByText(new RegExp(`^${label}$`, "i"))
    .locator("xpath=following-sibling::span[1]");
}

// --- Value parsing --------------------------------------------------------

/** "$10,000.00" -> 10000, "+$12.34 (+0.12%)" -> 12.34, "-$5.00" -> -5. */
export function parseMoney(text: string | null | undefined): number {
  if (!text) return Number.NaN;
  const normalized = text.replace(/[,\s−]/g, (match) => (match === "−" ? "-" : ""));
  const match = normalized.match(/(-?)\$?(-?)(\d+(?:\.\d+)?)/);
  if (!match) return Number.NaN;
  const negative = match[1] === "-" || match[2] === "-";
  return Number(match[3]) * (negative ? -1 : 1);
}

async function readNumber(locator: Locator): Promise<number> {
  return parseMoney(await locator.textContent());
}

export const readCash = (page: Page) => readNumber(headerReadout(page, "Cash"));
export const readPositionsValue = (page: Page) => readNumber(headerReadout(page, "Positions"));
export const readTotalValue = (page: Page) => readNumber(headerReadout(page, "Portfolio Value"));

// --- Page lifecycle -------------------------------------------------------

/**
 * Load the terminal and wait until it is actually live: SSE connected, prices
 * populated, and the portfolio fetched. Without this, tests race the first tick.
 */
export async function openTerminal(page: Page): Promise<void> {
  await page.goto("/");
  await waitForLiveStream(page);
  await expect.poll(() => readCash(page)).toBeGreaterThan(0);
}

export async function waitForLiveStream(page: Page): Promise<void> {
  await expect(connectionDot(page)).toHaveAttribute("data-status", "connected", {
    timeout: 30_000,
  });
  const firstPrice = watchlistPanel(page).getByTestId("price-cell").first();
  await expect(firstPrice).toBeVisible({ timeout: 30_000 });
  await expect(firstPrice).not.toHaveText("—", { timeout: 30_000 });
}

/**
 * Assert the watchlist prices actually move — the proof that SSE is streaming
 * rather than having delivered a single frame.
 */
export async function expectPricesToTick(page: Page, timeout = 30_000): Promise<void> {
  const cells = watchlistPanel(page).getByTestId("price-cell");
  const before = (await cells.allTextContents()).join("|");
  await expect
    .poll(async () => (await cells.allTextContents()).join("|"), {
      timeout,
      intervals: [500, 500, 1000],
    })
    .not.toBe(before);
}

// --- Watchlist ------------------------------------------------------------

/**
 * A `filter({ has })` locator is re-rooted at the row being filtered, so the
 * inner locator must be relative (page-rooted), never panel-scoped.
 */
const tickerCell = (page: Page, ticker: string) =>
  page.getByRole("cell", { name: ticker, exact: true });

/** The ticker cell for a watchlist row; `exact` keeps "V" from matching "NVDA". */
export const watchlistTicker = (page: Page, ticker: string) =>
  watchlistPanel(page).getByRole("cell", { name: ticker, exact: true });

export const watchlistRow = (page: Page, ticker: string) =>
  watchlistPanel(page).locator("tbody tr").filter({ has: tickerCell(page, ticker) });

// --- Positions ------------------------------------------------------------

export const positionCell = (page: Page, ticker: string) =>
  positionsPanel(page).getByRole("cell", { name: ticker, exact: true });

export const positionRow = (page: Page, ticker: string) =>
  positionsPanel(page).locator("tbody tr").filter({ has: tickerCell(page, ticker) });

/** Quantity column of a position row. */
export async function readPositionQuantity(page: Page, ticker: string): Promise<number> {
  return parseMoney(await positionRow(page, ticker).locator("td").nth(1).textContent());
}

// --- Trade bar ------------------------------------------------------------

export async function submitTrade(
  page: Page,
  ticker: string,
  quantity: number,
  side: "BUY" | "SELL",
): Promise<void> {
  await page.getByLabel("Trade ticker").fill(ticker);
  await page.getByLabel("Trade quantity").fill(String(quantity));
  await page.getByRole("button", { name: side, exact: true }).click();
}

// --- Chat -----------------------------------------------------------------

export async function sendChat(page: Page, message: string): Promise<void> {
  const chat = chatPanel(page);
  await chat.getByLabel("Message FinAlly").fill(message);
  await chat.getByRole("button", { name: "SEND", exact: true }).click();
  await expect(chat.getByText(/FinAlly is thinking/)).toBeHidden({ timeout: 30_000 });
}
