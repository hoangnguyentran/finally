import { defineConfig, devices } from "@playwright/test";

/**
 * BASE_URL is set to http://app:8000 by docker-compose.test.yml; the localhost
 * fallback targets a container started by hand (scripts/start_mac.sh).
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./specs",

  // Every spec drives the same single-user portfolio and watchlist, so the
  // suite is inherently stateful: one worker, files in filename order.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 1,

  // Prices arrive over SSE at ~500ms; assertions that wait for a tick or for a
  // portfolio refresh need more headroom than Playwright's 5s default.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Desktop-first layout: the xl breakpoint (1280px) drives the terminal
        // three-column arrangement, and the header's Positions readout needs md.
        viewport: { width: 1600, height: 1000 },
      },
    },
  ],
});
