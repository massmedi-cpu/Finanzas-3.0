import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const NOW = "2026-09-25T08:00:00.000Z";
const SHA = "a04ac0e05d32d72b1a30c18c65b48d4fd7e5e43c";
const script = join(process.cwd(), "scripts/report-web-vitals.mjs");

function sample(value: number, overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 2,
    level: "info",
    event: "financial-app-rum",
    appVersion: "10.0.2",
    deploymentSha: SHA,
    collectedAt: "2026-09-24T08:00:00.000Z",
    route: "/forecast",
    device: "mobile",
    metric: "LCP",
    value,
    rating: "good",
    budget: 2500,
    withinBudget: true,
    ...overrides,
  };
}

function runReport(lines: Array<string | Record<string, unknown>>, extraArguments: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "financial-rum-"));
  const input = join(directory, "runtime.ndjson");
  writeFileSync(input, lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n"));
  try {
    const result = spawnSync(process.execPath, [
      script,
      input,
      "--format=json",
      `--now=${NOW}`,
      "--window-days=28",
      "--routes=/forecast",
      "--devices=mobile",
      "--metrics=LCP",
      ...extraArguments,
    ], { encoding: "utf8" });
    return {
      status: result.status,
      report: result.stdout ? JSON.parse(result.stdout) : null,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("PRE-024 · el lector acepta solo versión, ruta, dispositivo y fecha operativos válidos", () => {
  const result = runReport([
    sample(1200),
    sample(1200, { route: "/forecast?account=secret" }),
    sample(1200, { device: "Pixel 9 XL" }),
    sample(1200, { contractVersion: 1 }),
    sample(1200, { collectedAt: "not-a-date" }),
  ], ["--min-samples=1"]);

  expect(result.status).toBe(0);
  expect(result.report.ingestion).toEqual({ accepted: 1, rejected: 4, ignored: 0 });
  expect(result.report.deploymentSha).toBe(SHA);
  expect(result.report.slices[0]).toMatchObject({
    route: "/forecast",
    device: "mobile",
    metric: "LCP",
    samples: 1,
    p75: 1200,
    status: "pass",
  });
});

test("PRE-024 · el lector extrae logs estructurados de Vercel y rechaza el contrato legado sin dispositivo", () => {
  const current = {
    timestamp: Date.parse("2026-09-24T08:00:00.000Z"),
    text: JSON.stringify(sample(1200)),
  };
  const legacy = `financial-app-rum ${JSON.stringify({
    ...sample(1400),
    contractVersion: 1,
    device: undefined,
  })}`;
  const prefixed = `[info] ${JSON.stringify(sample(1300))}`;
  const result = runReport([current, prefixed, legacy, "log ajeno"], ["--min-samples=1"]);

  expect(result.status).toBe(0);
  expect(result.report.ingestion).toEqual({ accepted: 2, rejected: 1, ignored: 1 });
  expect(result.report.slices[0]).toMatchObject({ samples: 2, p75: 1275, status: "pass" });
});

test("PRE-024 · percentiles p50/p75/p95 y budget se calculan de forma determinista", () => {
  const result = runReport([1000, 1200, 1400, 1600].map((value) => sample(value)), ["--min-samples=4"]);

  expect(result.status).toBe(0);
  expect(result.report.status).toBe("pass");
  expect(result.report.deploymentSha).toBe(SHA);
  expect(result.report.coverage).toEqual({ totalSlices: 1, sufficientSlices: 1, insufficientSlices: 0 });
  expect(result.report.slices[0]).toMatchObject({
    samples: 4,
    p50: 1300,
    p75: 1450,
    p95: 1570,
    budget: 2500,
    status: "pass",
  });
});

test("PRE-024 · despliegues con el mismo semver no se mezclan", () => {
  const previousSha = "b829adb07e00e46bb73e893b87e2b60a55d87315";
  const result = runReport([
    sample(3200, { deploymentSha: previousSha, collectedAt: "2026-09-23T08:00:00.000Z" }),
    sample(1200, { deploymentSha: SHA, collectedAt: "2026-09-24T08:00:00.000Z" }),
  ], ["--min-samples=1"]);

  expect(result.status).toBe(0);
  expect(result.report.deploymentSha).toBe(SHA);
  expect(result.report.sampleCount).toBe(1);
  expect(result.report.slices[0]).toMatchObject({ p75: 1200, status: "pass" });
});

test("PRE-024 · el gate diferencia regresión demostrada de muestra insuficiente", () => {
  const failing = runReport([2600, 2700, 2800, 2900].map((value) => sample(value)), ["--min-samples=4"]);
  expect(failing.status).toBe(1);
  expect(failing.report.status).toBe("fail");
  expect(failing.report.failingSlices).toBe(1);
  expect(failing.report.slices[0]).toMatchObject({ p75: 2825, status: "fail" });

  const insufficient = runReport([1000, 1100, 1200].map((value) => sample(value)), ["--min-samples=4"]);
  expect(insufficient.status).toBe(2);
  expect(insufficient.report.status).toBe("insufficient");
  expect(insufficient.report.failingSlices).toBe(0);
  expect(insufficient.report.slices[0]).toMatchObject({ samples: 3, status: "insufficient" });
});
