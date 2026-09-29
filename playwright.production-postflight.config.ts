import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PRODUCTION_URL?.trim() ?? "";
if (!baseURL) throw new Error("PRODUCTION_URL is required for production postflight.");

let parsed: URL;
try {
  parsed = new URL(baseURL);
} catch {
  throw new Error("PRODUCTION_URL must be a valid URL.");
}
if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
  throw new Error("PRODUCTION_URL must be a clean HTTPS origin without credentials, query or fragment.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "production-postflight-10.0.35.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: parsed.origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "allow",
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
});
