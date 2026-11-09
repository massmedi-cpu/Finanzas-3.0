import { defineConfig, devices } from "@playwright/test";

const baseURL = "https://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
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
    // CI must not depend on Next.js downloading mkcert. Generate a
    // short-lived localhost-only certificate offline while retaining HTTPS
    // for real WebKit iOS and Edge compatibility tests.
    command: process.env.CI
      ? `sh -c 'cert_dir="$(mktemp -d)" && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout "$cert_dir/key.pem" -out "$cert_dir/cert.pem" -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1 && npm run dev -- --hostname localhost --experimental-https --experimental-https-key "$cert_dir/key.pem" --experimental-https-cert "$cert_dir/cert.pem"'`
      : "npm run dev -- --hostname localhost --experimental-https",
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
