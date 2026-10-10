import { defineConfig } from "@playwright/test";

// Deliberately no webServer or browser: CPU-only financial projection lab.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /financial-(?:projection-capacity|api-server-timing)\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
});
