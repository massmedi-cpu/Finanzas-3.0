import { defineConfig, devices } from "@playwright/test";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.AUD_ISOLATED_SUITE !== "capacity"
  || !process.env.AUD_ISOLATED_DIR || new URL(process.env.SUPABASE_URL!).hostname !== "127.0.0.1") {
  throw new Error("disposable_capacity_runtime_required");
}
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /aud-e2e-capacity\.spec\.ts/,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000", locale: "es-ES", timezoneId: "Europe/Madrid",
    trace: "off", screenshot: "off", video: "off", serviceWorkers: "block",
  },
  projects: [{ name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "NODE_OPTIONS='--require ./scripts/aud-e2e-local-network.cjs' npm run start -- --hostname localhost",
    url: "http://localhost:3000/login", reuseExistingServer: false, timeout: 60_000,
  },
});
