import { expect, test } from "@playwright/test";
import { buildOfficialSourcePreflightSummary } from "../../src/application/source-preflight";
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
