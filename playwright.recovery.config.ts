import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Product recovery is measured against an optimized, already-built application.
// Screenshots and traces remain available; videos are optional diagnostics.
export default defineConfig({
  ...base,
  use: { ...base.use, video: "off" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
