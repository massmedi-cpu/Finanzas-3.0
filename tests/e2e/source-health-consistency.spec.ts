import { expect, test, type Page, type Route } from "@playwright/test";
import { syncSummary } from "../../app/api/analysis/source-freshness/route";
import type { AnalysisGatewaySnapshot } from "../../src/application/analysis/analysis-engine";
import { buildComparisonSnapshot } from "../../src/application/comparison/comparison-engine";
import { resolveComparisonSelection } from "../../src/application/comparison/comparison-selection";
import {
  hasSourceSyncIncidents,
  normalizeSourceSyncIncidents,
} from "../../src/application/source-sync-incidents";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000028";

const BASE_SYNC = {
  status: "success",
  finishedAt: "2026-09-28T04:30:00.000Z",
  startedAt: "2026-09-28T04:29:00.000Z",
  rowsSeen: 10,
  rowsFailed: 0,
  rowsMissing: 0,
  duplicatesDetected: 0,
  warningsCount: 0,
};

function comparisonSnapshot() {
  const selection = resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-10",
    accountId: ACCOUNT_ID,
  }, "2026-09-28");
  const period = {
    dateFrom: selection.primaryFrom,
    dateTo: selection.primaryTo,
    incomeCents: 50_000,
    expenseCents: 20_000,
    operatingNetCents: 30_000,
    savingsCents: 30_000,
    savingsRateBps: 6_000,
    quality: {
      scopedRows: 4,
      includedRows: 4,
      manuallyExcludedRows: 0,
      confirmedDuplicateRows: 0,
      suspectedDuplicateRows: 0,
      signMismatchRows: 0,
    },
  };
  const gateway: AnalysisGatewaySnapshot = {
    current: period,
    previous: { ...period, dateFrom: selection.referenceFrom, dateTo: selection.referenceTo },
    history: { rows: [] },
    accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
    categories: [],
    merchants: [],
    concentration: { top3CategoryBps: null, top3MerchantBps: null },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: 20_000,
    },
    budget: null,
    forecast: null,
  };
  return buildComparisonSnapshot({ selection, gateway });
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function openComparison(page: Page, sync: typeof BASE_SYNC) {
  await page.route("**/api/analysis/source-freshness", (route) => json(route, {
    available: true,
    latestMovementDate: "2026-09-27",
    sync,
  }));
  await page.route(/\/api\/compare(?:\?.*)?$/, (route) => json(route, comparisonSnapshot()));
  await page.goto(`/compare?primaryFrom=2026-09-01&primaryTo=2026-09-10&referenceFrom=2026-08-01&referenceTo=2026-08-10&accountId=${ACCOUNT_ID}`);
  await expect(page.getByRole("heading", { name: "Comparador", level: 1 })).toBeVisible();
}

test("10.0.28 normaliza incidencias sin contar dos veces las filas ausentes", () => {
  expect(normalizeSourceSyncIncidents({
    rowsFailed: 1,
    rowsMissing: 2,
    duplicatesDetected: 3,
    warningsCount: 4,
  })).toEqual({
    failedRows: 1,
    missingRows: 2,
    duplicates: 3,
    additionalWarnings: 2,
  });
  expect(hasSourceSyncIncidents({ rowsMissing: 1, warningsCount: 0 })).toBe(true);
  expect(hasSourceSyncIncidents({ duplicatesDetected: 1, warningsCount: 0 })).toBe(true);
  expect(hasSourceSyncIncidents({ status: "success", warningsCount: 0 })).toBe(false);
});

test("10.0.28 transporta las señales persistidas al contrato de frescura", () => {
  expect(syncSummary({
    run: {
      status: "success",
      started_at: "2026-09-28T04:29:00.000Z",
      finished_at: "2026-09-28T04:30:00.000Z",
      rows_seen: 10,
      rows_failed: 0,
      rows_missing: 2,
      duplicates_detected: 3,
      warnings_count: 2,
    },
  })).toMatchObject({
    rowsMissing: 2,
    duplicatesDetected: 3,
    warningsCount: 2,
  });
});

test("Comparador alerta de duplicados aunque warningsCount sea cero", async ({ page }) => {
  await openComparison(page, { ...BASE_SYNC, duplicatesDetected: 2 });

  const status = page.getByRole("status", { name: /Fuente sincronizada con incidencias/ });
  await expect(status).toHaveAttribute("aria-label", /2 posibles duplicados/);
  await expect(status).toContainText("Datos sincronizados con incidencias");
  await expect(status).toContainText("2 posibles duplicados");
  await expect(page.getByRole("link", { name: "Revisar fuente" })).toHaveAttribute("href", "/configuration/source");
});

test("Comparador separa movimientos ausentes de los avisos adicionales", async ({ page }) => {
  await openComparison(page, { ...BASE_SYNC, rowsMissing: 2, warningsCount: 3 });

  const status = page.getByRole("status", { name: /Fuente sincronizada con incidencias/ });
  await expect(status).toContainText("2 movimientos ya no están en la fuente");
  await expect(status).toContainText("1 aviso adicional");
  await expect(status).not.toContainText("3 avisos");
});

test("Comparador mantiene el estado limpio cuando todos los contadores están a cero", async ({ page }) => {
  await openComparison(page, BASE_SYNC);

  await expect(page.getByRole("status", { name: /Fuente sincronizada/ })).toContainText("Datos al día");
  await expect(page.getByRole("link", { name: "Revisar fuente" })).toHaveCount(0);
});
