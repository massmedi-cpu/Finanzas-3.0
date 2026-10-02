import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.VERCEL_PREVIEW_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "webkit-ios",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "edge-desktop",
      use: {
        browserName: "chromium",
        channel: "msedge",
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
