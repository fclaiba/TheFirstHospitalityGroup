import { defineConfig, devices } from "@playwright/test";

// E2E (BLUEPRINT 15): staff day, floor request and approval, warning flow, manager close, owner dashboard, plus axe,
// on Pixel 7, iPhone SE (375) and desktop 1440. Runs against BASE_URL (a Vercel preview in CI) or a local server in
// preview mode. Locally it uses the system Chrome (`playwright install` is not required).
const baseURL = process.env.BASE_URL ?? "http://localhost:3300";
const channel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : undefined,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
    { name: "small", use: { ...devices["iPhone SE"], defaultBrowserType: "chromium", browserName: "chromium", channel } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: "npm run build && npm run start", url: baseURL, reuseExistingServer: true, timeout: 300_000 },
});
