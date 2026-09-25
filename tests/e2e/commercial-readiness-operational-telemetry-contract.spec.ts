import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("CR-007 · la telemetría operativa es first-party, mínima y no contamina RUM fuera de Production", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato CR-007 se valida una vez por run");

  const root = process.cwd();
  const contract = readFileSync(join(root, "src/observability/operational-telemetry-contract.ts"), "utf8");
  const reporter = readFileSync(join(root, "app/operational-telemetry.tsx"), "utf8");
  const endpoint = readFileSync(join(root, "app/api/telemetry/client/route.ts"), "utf8");
  const policy = JSON.parse(
    readFileSync(join(root, "src/observability/web-vitals-policy.json"), "utf8"),
  ) as Record<string, unknown>;
  const reportScript = readFileSync(join(root, "scripts/report-web-vitals.mjs"), "utf8");
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  const accessControl = readFileSync(join(root, "src/infrastructure/auth/access-control.ts"), "utf8");

  expect(policy).toMatchObject({
    contractVersion: 2,
    reportVersion: 1,
    windowDays: 28,
    minSamplesPerSlice: 30,
    devices: ["mobile", "desktop"],
    gateMetrics: ["LCP", "INP", "CLS"],
    budgets: { CLS: 0.1, FCP: 1800, FID: 100, INP: 200, LCP: 2500, TTFB: 800 },
  });
  expect(contract).toContain('WEB_VITAL_FIELDS');
  expect(contract).toContain('CLIENT_ERROR_FIELDS');
  expect(contract).toContain('"device"');
  expect(contract).toContain('hasOnlyKeys');
  expect(contract).toContain('return "/other"');

  expect(reporter).toContain('useReportWebVitals');
  expect(reporter).toContain('TELEMETRY_ENDPOINT = "/api/telemetry/client"');
  expect(reporter).toContain('credentials: "same-origin"');
  expect(reporter).toContain('keepalive: true');
  expect(reporter).toContain('window.matchMedia("(max-width: 767px)")');
  expect(reporter).toContain('device: currentTelemetryDevice()');
  expect(reporter).toContain('metric.rating');
  expect(reporter).toContain('enabled && pathname !== "/login"');
  expect(reporter).toContain('if (!enabled || pathname === "/login") return;');
  expect(reporter).toContain('"window_error"');
  expect(reporter).toContain('"unhandled_rejection"');
  expect(reporter).not.toContain('error.message');
  expect(reporter).not.toContain('.stack');
  expect(reporter).not.toContain('location.href');
  expect(reporter).not.toContain('location.search');
  expect(reporter).not.toContain('document.cookie');
  expect(reporter).not.toContain('navigator.userAgent');
  expect(reporter).not.toContain('window.innerWidth');
  expect(reporter).not.toContain('localStorage');
  expect(reporter).not.toContain('sessionStorage');

  expect(endpoint).toContain('process.env.VERCEL_ENV !== "production"');
  expect(endpoint).toContain('event: "financial-app-rum"');
  expect(endpoint).toContain('event: "financial-app-client-error"');
  expect(endpoint).toContain('collectedAt: new Date().toISOString()');
  expect(endpoint).toContain('budget: WEB_VITAL_BUDGETS[telemetry.name]');
  expect(endpoint).not.toContain('rawBody,');
  expect(reportScript).toContain('percentile(values, 50)');
  expect(reportScript).toContain('percentile(values, 75)');
  expect(reportScript).toContain('percentile(values, 95)');
  expect(reportScript).toContain('minSamplesPerSlice');
  expect(layout).toContain('<OperationalTelemetryReporter enabled={process.env.VERCEL_ENV === "production"} />');
  expect(accessControl).not.toContain('"/api/telemetry/client"');

  const validVital = await request.post('/api/telemetry/client', {
    data: {
      type: 'web_vital',
      route: '/transactions?account=secret',
      device: 'desktop',
      name: 'LCP',
      value: 1200,
      rating: null,
    },
  });
  expect(validVital.status()).toBe(204);

  const missingDevice = await request.post('/api/telemetry/client', {
    data: {
      type: 'web_vital',
      route: '/transactions',
      name: 'LCP',
      value: 1200,
      rating: 'good',
    },
  });
  expect(missingDevice.status()).toBe(400);

  const extraSensitiveField = await request.post('/api/telemetry/client', {
    data: {
      type: 'client_error',
      route: '/transactions',
      kind: 'window_error',
      errorName: 'TypeError',
      message: 'saldo privado',
    },
  });
  expect(extraSensitiveField.status()).toBe(400);
  expect(await extraSensitiveField.json()).toMatchObject({ error: 'invalid_telemetry' });

  const unsafeErrorName = await request.post('/api/telemetry/client', {
    data: {
      type: 'client_error',
      route: '/transactions',
      kind: 'window_error',
      errorName: 'TypeError: saldo 1.234,56',
    },
  });
  expect(unsafeErrorName.status()).toBe(400);

  const wrongContentType = await request.post('/api/telemetry/client', {
    headers: { 'content-type': 'text/plain' },
    data: 'not-json',
  });
  expect(wrongContentType.status()).toBe(415);
});
