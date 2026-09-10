import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const gatewayIndex = readFileSync(
  "supabase/functions/financial-app-db-gateway/index.ts",
  "utf8",
);
const sourceRouter = readFileSync(
  "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
  "utf8",
);
const dataExportHandler = readFileSync(
  "supabase/functions/financial-app-db-gateway/data-export.ts",
  "utf8",
);
const downloadRoute = readFileSync("app/api/data/export/route.ts", "utf8");
const dataTrustPage = readFileSync("app/configuration/data/page.tsx", "utf8");

test("PRE-020B · data.export_v1 queda fuera de la allowlist Preview→Production", () => {
  const start = gatewayIndex.indexOf("const PREVIEW_READ_ONLY_ACTIONS");
  const end = gatewayIndex.indexOf("]);", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const previewAllowlist = gatewayIndex.slice(start, end + 3);
  expect(previewAllowlist).not.toContain("data.export_v1");
});

test("PRE-020B · el handler exporta sólo en Production y reutiliza la función RLS", () => {
  expect(sourceRouter).toContain('import { handleDataExportAction } from "./data-export.ts"');
  expect(sourceRouter).toContain("await handleDataExportAction(input)");
  expect(dataExportHandler).toContain('input.action !== "data.export_v1"');
  expect(dataExportHandler).toContain('input.environment !== "production"');
  expect(dataExportHandler).toContain("financial_app.export_current_workspace_data()");
  expect(dataExportHandler).toContain('"cache-control": "no-store"');
  expect(dataExportHandler).toContain('"x-content-type-options": "nosniff"');
});

test("PRE-020B · la API de descarga está cerrada en Preview y fuerza descarga segura", () => {
  expect(downloadRoute).toContain('process.env.VERCEL_ENV !== "production"');
  expect(downloadRoute).toContain('callPersistenceGateway<DataExportGatewayResult>("data.export_v1")');
  expect(downloadRoute).toContain('"content-disposition": \'attachment; filename="financial-app-data-export.json"\'');
  expect(downloadRoute).toContain('"cache-control": "no-store"');
  expect(downloadRoute).toContain('"x-content-type-options": "nosniff"');
  expect(downloadRoute).toContain('"x-robots-tag": "noindex"');
});

test("PRE-020B · el endpoint ejecutado rechaza cualquier entorno no Production", async ({ request }) => {
  const response = await request.get("/api/data/export");
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await response.json()).toEqual({
    error: "data_export_production_only",
    code: "preview_production_export_forbidden",
  });
});

test("PRE-020B · la superficie de datos expone la descarga sin exponer acciones internas", () => {
  expect(dataTrustPage).toContain('href="/api/data/export"');
  expect(dataTrustPage).toContain("Descargar mis datos");
  expect(dataTrustPage).not.toContain("data.export_v1");
});
