import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.VERCEL_PREVIEW_URL ?? "http://127.0.0.1:3000";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const isProtectedPreview = /^https:\/\/.*\.vercel\.app\/?$/i.test(baseURL);

if (isProtectedPreview && !bypassSecret) {
  throw new Error(
    "VERCEL_AUTOMATION_BYPASS_SECRET is required for protected Vercel preview E2E tests.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: bypassSecret
      ? {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: isProtectedPreview
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
