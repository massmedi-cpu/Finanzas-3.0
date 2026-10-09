import { defineConfig, devices } from "@playwright/test";

// Runs only with the guarded, local Supabase stack. No Vercel or cloud secrets.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /aud-e2e-(authenticated-isolation|full-http)\.spec\.ts/,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off", screenshot: "off", video: "off",
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "NODE_OPTIONS='--require ./scripts/aud-e2e-local-network.cjs' npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
