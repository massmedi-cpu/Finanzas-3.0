import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DATA_TRUST_CAPABILITIES } from "../../src/domain/data-trust-contract";
import { isPublicAuthPath } from "../../src/infrastructure/auth/access-control";

const HEALTH_PATHS = [
  "/api/health/foundations",
  "/api/health/persistence",
  "/api/health/data-quality",
  "/api/health/source-runtime",
] as const;

const foundations = readFileSync("app/api/health/foundations/route.ts", "utf8");
const persistence = readFileSync("app/api/health/persistence/route.ts", "utf8");
const dataQuality = readFileSync("app/api/health/data-quality/route.ts", "utf8");
const sourceRuntime = readFileSync("app/api/health/source-runtime/route.ts", "utf8");

const serviceHealth = DATA_TRUST_CAPABILITIES.find(
  (capability) => capability.id === "operator-service-health",
);

test("CR-004 · los diagnósticos técnicos no son rutas públicas", () => {
  for (const path of HEALTH_PATHS) {
    expect(isPublicAuthPath(path), path).toBe(false);
  }
});

test("CR-004 · persistencia comprueba OIDC → gateway → Postgres y falla cerrado", () => {
  expect(persistence).toContain("getVercelOidcToken");
  expect(persistence).toContain('body: JSON.stringify({ action: "health" })');
  expect(persistence).toContain('status: "failed"');
  expect(persistence).toContain("{ status: 503 }");
  expect(persistence).toContain('"cache-control": "no-store"');
  expect(persistence).toContain('"x-robots-tag": "noindex"');
});

test("CR-004 · health checks cubren fundamentos, calidad y runtime sin cache pública", () => {
  expect(foundations).toContain("runCompleteFoundationHealthChecks");
  expect(foundations).toContain('"Cache-Control": "no-store"');

  expect(dataQuality).toContain("runDataQualityHealthChecks");
  expect(dataQuality).toContain("runHistoricalSourceHealthChecks");
  expect(dataQuality).toContain('"cache-control": "no-store"');
  expect(dataQuality).toContain('"x-robots-tag": "noindex"');

  expect(sourceRuntime).toContain('callPersistenceGateway<SourceSyncRuntimeCapabilities>("source.capabilities")');
  expect(sourceRuntime).toContain("status: 503");
  expect(sourceRuntime).toContain('"cache-control": "no-store"');
  expect(sourceRuntime).toContain('"x-robots-tag": "noindex"');
});

test("CR-004 · el contrato expone diagnóstico como operación interna, no soporte comercial", () => {
  expect(serviceHealth?.state).toBe("operator_only");
  expect(serviceHealth?.evidence.length).toBeGreaterThanOrEqual(5);
  expect(serviceHealth?.summary).toContain("capacidad interna de operación");
  expect(serviceHealth?.summary).toContain("no un canal de soporte para terceros");
  expect(serviceHealth?.summary ?? "").not.toMatch(/\bsla\b/i);
  expect(serviceHealth?.summary ?? "").not.toContain("página pública de estado");
  expect(DATA_TRUST_CAPABILITIES.find((capability) => capability.id === "support-and-service-status")).toBeUndefined();
});
