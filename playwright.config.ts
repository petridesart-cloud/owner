import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a local Supabase (supabase start) with DEMO_MODE=true,
// which shows login codes on screen and uses the mock checkout.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
