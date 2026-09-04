import { expect, test } from "@playwright/test";
import {
  SourceWorkbookContractError,
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
} from "../../src/application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";

const currentNewest: SourceCellValue[] = [
  "CC-ORDER-NEW",
  46267,
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Ingreso",
  "Otros ingresos",
  "Prueba",
  "MOVIMIENTO NUEVO",
  "MOVIMIENTO NUEVO",
  "Openbank",
  1,
  101,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Documento de prueba",
];

const currentOldest: SourceCellValue[] = [
  "CC-ORDER-OLD",
  46266,
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Ingreso",
  "Otros ingresos",
  "Prueba",
  "MOVIMIENTO ANTIGUO",
  "MOVIMIENTO ANTIGUO",
  "Openbank",
  100,
  100,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Documento de prueba",
];

const savingsRow: SourceCellValue[] = [
  "AH-ORDER-1",
  46267,
  null,
  "Cuenta ahorro Openbank · 2504",
  "Openbank",
  "****2504",
  "Cuenta bancaria",
  "Ingreso",
  "Ingresos financieros",
  "Intereses cuenta ahorro",
  "LIQUIDACION CUENTA PRUEBA",
  "LIQUIDACION CUENTA PRUEBA",
  "Openbank",
  2,
  2,
  "Abono de intereses",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Documento de prueba",
];

function workbook(currentRows: SourceCellValue[][]): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "official-order-test",
    sourceRevision: "revision-order-test",
    sheets: [
      {
        sourceSheetId: "725351515",
        title: "Cuenta corriente · 3967",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: currentRows,
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

test("official source preserves newest-first order before deriving opening balance", () => {
  const prepared = prepareOfficialSourceSyncBatch(workbook([currentNewest, currentOldest]));
  const checking = prepared.accounts.find((account) => account.accountType === "checking");

  expect(checking?.openingBalanceCents).toBe(0);
  expect(prepared.observations.map((row) => row.sourceRowKey).slice(0, 2)).toEqual([
    "CC-ORDER-NEW",
    "CC-ORDER-OLD",
  ]);
});

test("official source rejects chronological reordering instead of guessing", () => {
  let captured: unknown = null;

  try {
    prepareOfficialSourceSyncBatch(workbook([currentOldest, currentNewest]));
  } catch (error) {
    captured = error;
  }

  expect(captured).toBeInstanceOf(SourceWorkbookContractError);
  expect((captured as SourceWorkbookContractError).code).toBe("source_order_mismatch");
  expect((captured as SourceWorkbookContractError).sourceSheetId).toBe("725351515");
  expect((captured as SourceWorkbookContractError).sourceRowKey).toBe("CC-ORDER-NEW");
});
