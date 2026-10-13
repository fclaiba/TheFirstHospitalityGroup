import { defineConfig, devices } from "@playwright/test";

// E2E (BLUEPRINT 11.3): the four critical flows in 3.1 plus axe. Runs against BASE_URL (Vercel preview in CI)
// or the local dev server. Locally it uses the system Chrome (`playwright install` is not required).
const baseURL = process.env.BASE_URL ?? "http://localhost:3300";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : undefined,
  },
  // Three device classes (ADR 0015): the reference phone, the smallest supported phone, and a desktop.
  projects: [
    // Real backend (docs/qa): `npm run test:live` with `npx convex dev` and `next dev` on .env.local, after seed:liveFixture.
    { name: "live", testMatch: /live\/.*\.spec\.ts/, use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" } },
    { name: "mobile", testIgnore: /live\//, use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" } },
    {
      name: "small",
      testIgnore: /live\//,
      use: { ...devices["iPhone SE"], defaultBrowserType: "chromium", browserName: "chromium", channel: process.env.CI ? undefined : "chrome" },
    },
    { name: "desktop", testIgnore: /live\//, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: process.env.CI ? undefined : "chrome" } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
