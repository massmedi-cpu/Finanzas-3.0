import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildOfficialSourcePreflightSummary } from "../../src/application/source-preflight";
import { isConfirmedSourcePreflight, isConfirmedSourceSyncResult } from "../../src/application/source-confirmation-contract";
import type { OfficialSourceWorkbookSnapshot } from "../../src/application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";

const currentRow: SourceCellValue[] = [
  "CC-PREFLIGHT-1",
  "04/09/2026",
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Ingreso",
  "Otros ingresos",
  "Prueba",
  "INGRESO PREFLIGHT",
  "INGRESO PREFLIGHT",
  "Openbank",
  1,
  1,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

const prepaidRow: SourceCellValue[] = [
  "TP-PREFLIGHT-1",
  "03/09/2026",
  null,
  "Tarjeta prepago Openbank · 8403",
  "Openbank",
  "****8403",
  "Tarjeta",
  "Gasto",
  "Compras",
  "Prueba",
  "COMPRA PREFLIGHT",
  "COMPRA PREFLIGHT",
  "Comercio prueba",
  -0.5,
  null,
  "Tarjeta prepago",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

const savingsRow: SourceCellValue[] = [
  "AH-PREFLIGHT-1",
  "04/09/2026",
  null,
  "Cuenta ahorro Openbank · 2504",
  "Openbank",
  "****2504",
  "Cuenta bancaria",
  "Ingreso",
  "Ingresos financieros",
  "Intereses cuenta ahorro",
  "LIQUIDACION PREFLIGHT",
  "LIQUIDACION PREFLIGHT",
  "Openbank",
  2,
  2,
  "Abono de intereses",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

function snapshot(): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "preflight-source-test",
    sourceRevision: "drive-version:preflight",
    sheets: [
      {
        sourceSheetId: "725351515",
        title: "Cuenta corriente · 3967",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [currentRow, prepaidRow],
      },
      {
        sourceSheetId: "2504001",
        title: "Cuenta ahorro · 2504",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [savingsRow],
      },
    ],
  };
}

test("preflight resume los tres productos sin perder el orden físico que usarán los cursores", () => {
  const summary = buildOfficialSourcePreflightSummary(snapshot());

  expect(summary.totalAuthoritativeRows).toBe(3);
  expect(summary.accounts).toHaveLength(3);
  expect(summary.cursors).toEqual([
    {
      sourceSheetId: "725351515",
      sheetTitle: "Cuenta corriente · 3967",
      authoritativeRows: 2,
      lastSourceRowKey: "TP-PREFLIGHT-1",
    },
    {
      sourceSheetId: "2504001",
      sheetTitle: "Cuenta ahorro · 2504",
      authoritativeRows: 1,
      lastSourceRowKey: "AH-PREFLIGHT-1",
    },
  ]);

  const checking = summary.accounts.find((account) => account.accountType === "checking");
  const savings = summary.accounts.find((account) => account.accountType === "savings");
  const prepaid = summary.accounts.find((account) => account.accountExternalKey.includes("prepago"));

  expect(checking).toMatchObject({ authoritativeRows: 1, openingBalanceCents: 0, latestBalanceAfterCents: 100 });
  expect(savings).toMatchObject({ authoritativeRows: 1, openingBalanceCents: 0, latestBalanceAfterCents: 200 });
  expect(prepaid).toMatchObject({
    authoritativeRows: 1,
    openingBalanceCents: 0,
    latestBalanceAfterCents: null,
    lifecycle: "archived",
    accountType: "other",
  });
});


test("REC-SYNC-202 · el preflight canónico es aceptado y los recibos incompletos no", () => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  expect(isConfirmedSourcePreflight(valid)).toBe(true);
  expect(isConfirmedSourcePreflight({ ...valid, schemaFingerprint: "wrong" })).toBe(false);
  expect(isConfirmedSourcePreflight({ ...valid, cursors: [] })).toBe(false);
  expect(isConfirmedSourcePreflight({ ...valid, totalAuthoritativeRows: 100 })).toBe(false);
});

test("REC-SYNC-203 · solo un recibo de importación coherente certifica éxito", () => {
  const receipt = {
    status: "success",
    syncRunId: "11111111-1111-4111-8111-111111111111",
    rowsSeen: 3,
    rowsInserted: 1,
    rowsRevised: 0,
    rowsSkipped: 2,
    rowsMissing: 0,
    duplicatesDetected: 0,
    warningsCount: 0,
    cursorsAdvanced: 2,
  };
  expect(isConfirmedSourceSyncResult(receipt)).toBe(true);
  expect(isConfirmedSourceSyncResult({ ...receipt, status: "partial" })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, rowsInserted: "1" })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, rowsSeen: 999 })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, syncRunId: null })).toBe(false);
});

test("REC-SYNC-240 · el preflight rechaza identidades duplicadas y fechas incoherentes aunque sumen las filas", () => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  expect(isConfirmedSourcePreflight(valid)).toBe(true);

  // Los tres productos incluyen dos con una sola fila: duplicar el primero
  // mantiene intacto el total, pero oculta otro producto bancario.
  const repeatedAccounts = { ...valid, accounts: [valid.accounts[0], valid.accounts[0], valid.accounts[2]] };
  expect(repeatedAccounts.accounts.reduce((total, item) => total + item.authoritativeRows, 0))
    .toBe(valid.totalAuthoritativeRows);
  expect(isConfirmedSourcePreflight(repeatedAccounts)).toBe(false);

  const repeatedCursors = {
    ...valid,
    cursors: [
      { ...valid.cursors[0], authoritativeRows: 1 },
      { ...valid.cursors[0], authoritativeRows: 2 },
    ],
  };
  expect(repeatedCursors.cursors.reduce((total, item) => total + item.authoritativeRows, 0))
    .toBe(valid.totalAuthoritativeRows);
  expect(isConfirmedSourcePreflight(repeatedCursors)).toBe(false);

  const changedAccount = (changes: Record<string, unknown>) => ({
    ...valid,
    accounts: [{ ...valid.accounts[0], ...changes }, ...valid.accounts.slice(1)],
  });
  expect(isConfirmedSourcePreflight(changedAccount({ newestBankDate: "2026-02-31" }))).toBe(false);
  expect(isConfirmedSourcePreflight(changedAccount({
    oldestBankDate: "2026-10-20",
    newestBankDate: "2026-01-01",
  }))).toBe(false);
  expect(isConfirmedSourcePreflight(changedAccount({ oldestBankDate: null }))).toBe(false);
});

test("REC-SYNC-241 · prevalidación inválida y relectura de estado impiden todo POST de sincronización", async ({ page }) => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  // Counts still add up, but the account identity is duplicated.
  let receivedPreflight: unknown = {
    ...valid,
    accounts: [valid.accounts[0], valid.accounts[0], valid.accounts[2]],
  };
  let synchronizationPosts = 0;

  await page.route("**/api/source/google/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      configured: true,
      authMode: "service-account",
      connection: {
        connected: true,
        accountEmail: "reader@example.invalid",
        sourceFileName: "Movimientos bancarios - fuente",
        connectedAt: null,
        lastVerifiedAt: null,
        readonly: true,
        managed: true,
      },
    }),
  }));
  await page.route("**/api/health/source-runtime", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      compatible: true,
      capabilities: { contractVersion: 2, sourceAccountLifecycle: true, canonicalProductSelection: true },
    }),
  }));
  await page.route("**/api/source/google/sync", (route) => {
    if (route.request().method() === "POST") {
      synchronizationPosts += 1;
      return route.fulfill({ status: 503, body: "No financial persistence is allowed in this test" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: null, cursors: [] }),
    });
  });
  await page.route("**/api/source/google/preflight", (route) => {
    expect(route.request().method()).toBe("POST");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(receivedPreflight),
    });
  });

  await page.goto("/configuration/source");
  const validate = page.getByRole("button", { name: "Validar fuente antes de importar" });
  await expect(validate).toBeEnabled();
  await validate.click();
  await expect(page.getByRole("alert")).toContainText("No se permite importar");
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toHaveCount(0);
  expect(synchronizationPosts).toBe(0);

  // A successful check can enable the control, but reading status again
  // must revoke the approval, rather than silently reusing an old snapshot.
  receivedPreflight = valid;
  await validate.click();
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeEnabled();
  await page.getByRole("button", { name: "Comprobar estado" }).click();
  await expect(page.getByRole("button", { name: "Validar fuente antes de importar" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toHaveCount(0);
  expect(synchronizationPosts).toBe(0);
});

test("REC-SYNC-242 · el backend valida el resumen canónico antes de permitir syncBatch", () => {
  const route = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  const post = route.indexOf("export async function POST()");
  const summary = route.indexOf("assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot))", post);
  const gate = route.indexOf("if (!isConfirmedSourcePreflight(summary))", summary);
  const sync = route.indexOf("runtime.synchronization.synchronize(snapshot)", gate);
  expect(post).toBeGreaterThan(-1);
  expect(summary).toBeGreaterThan(post);
  expect(gate).toBeGreaterThan(summary);
  expect(sync).toBeGreaterThan(gate);
  expect(route.slice(gate, sync)).toContain('status: 422');
});
