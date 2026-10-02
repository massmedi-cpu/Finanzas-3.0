import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const RUNTIME_OK = {
  status: "ok",
  compatible: true,
  capabilities: {
    contractVersion: 2,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
  },
};

const CONNECTED_SOURCE = {
  configured: true,
  connection: {
    connected: true,
    accountEmail: "alberto@example.test",
    sourceFileName: "Movimientos bancarios - fuente",
    connectedAt: "2026-09-27T05:00:00.000Z",
    lastVerifiedAt: "2026-09-27T05:30:00.000Z",
    readonly: true,
  },
};

const BASE_RUN = {
  id: "10000000-0000-4000-8000-000000000127",
  sourceFileId: "sheet-test",
  sourceRevision: "drive-version:127",
  status: "success",
  startedAt: "2026-09-27T05:29:00.000Z",
  finishedAt: "2026-09-27T05:30:00.000Z",
  rowsSeen: 12,
  rowsInserted: 0,
  rowsRevised: 0,
  rowsSkipped: 12,
  rowsFailed: 0,
  rowsMissing: 0,
  duplicatesDetected: 0,
  warningsCount: 0,
  errorCode: null,
  errorMessage: null,
};

const CURSORS = [{
  sourceFileId: "sheet-test",
  sourceSheetId: "sheet-1",
  sourceRevision: "drive-version:127",
  lastSourceRowKey: "ROW-12",
  lastSuccessfulRunId: BASE_RUN.id,
  updatedAt: "2026-09-27T05:30:00.000Z",
}];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockConnectedConfiguration(page: Page) {
  await page.route("**/api/health/source-runtime", (route) => json(route, RUNTIME_OK));
  await page.route("**/api/source/google/status", (route) => json(route, CONNECTED_SOURCE));
}

async function mockReviewSources(
  page: Page,
  sourceRun: Partial<typeof BASE_RUN>,
) {
  await page.route("**/api/transactions**", (route) => json(route, {
    rows: [],
    totalCount: 0,
    hasMore: false,
    nextCursor: null,
  }));
  await page.route("**/api/recurrences**", (route) => json(route, { candidates: [] }));
  await page.route("**/api/documents**", (route) => json(route, { total: 0, items: [] }));
  await page.route("**/api/budgets**", (route) => json(route, { categories: [] }));
  await page.route("**/api/forecast**", (route) => json(route, { items: [] }));
  await page.route("**/api/source/google/status", (route) => json(route, CONNECTED_SOURCE));
  await page.route("**/api/source/google/sync", (route) => json(route, {
    run: { ...BASE_RUN, ...sourceRun },
    cursors: CURSORS,
  }));
}

test("10.0.27 transporta incidencias persistidas sin crear otra fuente de verdad", () => {
  const route = readFileSync(resolve(process.cwd(), "app/api/source/google/sync/route.ts"), "utf8");
  const source = readFileSync(resolve(process.cwd(), "app/configuration/source/source-client.tsx"), "utf8");
  const overview = readFileSync(resolve(process.cwd(), "app/configuration/source/source-overview-client.tsx"), "utf8");
  const review = readFileSync(resolve(process.cwd(), "app/review/review-client.tsx"), "utf8");
  const incidents = readFileSync(resolve(process.cwd(), "src/application/source-sync-incidents.ts"), "utf8");

  expect(route).toContain("rowsMissing: status.run.rows_missing");
  expect(route).toContain("duplicatesDetected: status.run.duplicates_detected");
  expect(source).toContain("rowsMissing: number;");
  expect(source).toContain("Ya no están en la fuente");
  expect(source).toContain("sourceIncidentMessage(syncStatus.run)");
  expect(source).toContain("normalizeSourceSyncIncidents");
  expect(overview).toContain("normalizeSourceSyncIncidents");
  expect(overview).toContain('href="/configuration/source/diagnostics"');
  expect(review).toContain("hasSourceSyncIncidents(syncStatus.run)");
  expect(incidents).toContain("rowsMissing?: number | null;");
  expect(incidents).toContain("duplicatesDetected?: number | null;");
});

test("Para revisar mantiene alertada la fuente si faltan filas aunque warningsCount sea cero", async ({ page }) => {
  await mockReviewSources(page, { rowsMissing: 2, warningsCount: 0 });
  await page.goto("/review");

  const sourceAction = page.getByRole("article", { name: "Sincronización bancaria" });
  await expect(sourceAction).toContainText("1");
  await expect(sourceAction.getByRole("link", { name: "Revisar" }))
    .toHaveAttribute("href", "/configuration/source");
  await expect(page.getByRole("region", { name: "Todo en orden" }).getByText("Sincronización bancaria", { exact: true }))
    .toHaveCount(0);
});

test("Para revisar mantiene alertada la fuente ante duplicados aunque warningsCount sea cero", async ({ page }) => {
  await mockReviewSources(page, { duplicatesDetected: 2, warningsCount: 0 });
  await page.goto("/review");

  await expect(page.getByRole("article", { name: "Sincronización bancaria" })).toContainText("1");
  await expect(page.getByRole("region", { name: "Todo en orden" }).getByText("Sincronización bancaria", { exact: true }))
    .toHaveCount(0);
});

test("Diagnóstico explica las incidencias persistidas y las conserva tras recargar", async ({ page }) => {
  await mockConnectedConfiguration(page);
  await page.route("**/api/source/google/sync", (route) => json(route, {
    run: {
      ...BASE_RUN,
      rowsMissing: 2,
      duplicatesDetected: 1,
      warningsCount: 3,
    },
    cursors: CURSORS,
  }));

  await page.goto("/configuration/source/diagnostics");
  const trace = page.getByRole("region", { name: "Última sincronización persistida" });
  await expect(trace.locator("dl div").filter({ hasText: "Ya no están en la fuente" })).toContainText("2");
  await expect(trace.locator("dl div").filter({ hasText: "Duplicados detectados en esa ejecución" })).toContainText("1");
  await expect(trace.locator("dl div").filter({ hasText: "Otros avisos" })).toContainText("1");

  const warning = trace.getByRole("status");
  await expect(warning).toContainText("2 movimientos importados anteriormente ya no aparecen en la fuente");
  await expect(warning).toContainText("1 posible duplicado detectado");
  await expect(warning).toContainText("1 aviso adicional requiere revisión");
  await expect(warning).toContainText("la fuente bancaria original no se ha modificado");

  await page.reload();
  await expect(page.getByRole("region", { name: "Última sincronización persistida" }).getByRole("status"))
    .toContainText("2 movimientos importados anteriormente ya no aparecen en la fuente");
});

test("la vista simple resume una sincronización con incidencias y mantiene solo lectura", async ({ page }) => {
  let synchronized = false;
  await mockConnectedConfiguration(page);
  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() === "POST") {
      synchronized = true;
      await json(route, {
        syncRunId: BASE_RUN.id,
        status: "success",
        rowsSeen: 12,
        rowsInserted: 0,
        rowsRevised: 0,
        rowsSkipped: 12,
        rowsMissing: 1,
        duplicatesDetected: 2,
        warningsCount: 1,
        cursorsAdvanced: 1,
        sourceRevision: "drive-version:128",
      });
      return;
    }

    await json(route, {
      run: synchronized
        ? { ...BASE_RUN, sourceRevision: "drive-version:128", rowsMissing: 1, duplicatesDetected: 2, warningsCount: 1 }
        : BASE_RUN,
      cursors: CURSORS,
    });
  });

  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  const warning = page.locator(".config-message.warning");
  await expect(warning).toContainText("Actualización completada con avisos");
  await expect(warning).toContainText("1 movimiento ya no aparece en la fuente");
  await expect(warning).toContainText("2 posibles duplicados");
  await expect(warning).toContainText("El archivo original no se ha modificado");
  await expect(page.locator(".config-message.success")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Detalles técnicos" }))
    .toHaveAttribute("href", "/configuration/source/diagnostics");
});
