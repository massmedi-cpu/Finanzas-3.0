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

const prepaidMixedRow: SourceCellValue[] = [
  "PP-ORDER-1",
  46266,
  null,
  "Tarjeta prepago Openbank · 8403",
  "Openbank",
  "****8403",
  "Tarjeta",
  "Gasto",
  "Compras",
  "Prueba",
  "COMPRA PREPAGO",
  "COMPRA PREPAGO",
  "Comercio prueba",
  -5,
  0,
  "Tarjeta",
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

const staleSavingsCopyOutOfPhysicalOrder: SourceCellValue[] = [
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
  "LIQUIDACION CUENTA COPIA HISTORICA",
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
  "Copia histórica incrustada fuera del orden cronológico global de la pestaña física",
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

test("mixed logical products keep the original physical sheet order for per-sheet cursors", () => {
  const prepared = prepareOfficialSourceSyncBatch(
    workbook([currentNewest, prepaidMixedRow, currentOldest]),
  );
  const currentSheetRows = prepared.observations
    .filter((row) => row.sourceSheetId === "725351515")
    .map((row) => row.sourceRowKey);
  const prepaid = prepared.accounts.find(
    (account) => account.accountName === "Tarjeta prepago Openbank · 8403",
  );

  expect(currentSheetRows).toEqual(["CC-ORDER-NEW", "PP-ORDER-1", "CC-ORDER-OLD"]);
  expect(currentSheetRows.at(-1)).toBe("CC-ORDER-OLD");
  expect(prepaid?.lifecycle).toBe("archived");
  expect(prepaid?.openingBalanceCents).toBe(0);
});

test("historical copies from another product do not impose a false global date order", () => {
  const prepared = prepareOfficialSourceSyncBatch(
    workbook([currentNewest, currentOldest, staleSavingsCopyOutOfPhysicalOrder]),
  );
  const currentSheetRows = prepared.observations
    .filter((row) => row.sourceSheetId === "725351515")
    .map((row) => row.sourceRowKey);
  const savings = prepared.observations.filter(
    (row) => row.accountExternalKey === "Cuenta ahorro Openbank · 2504",
  );

  expect(currentSheetRows).toEqual(["CC-ORDER-NEW", "CC-ORDER-OLD"]);
  expect(currentSheetRows.at(-1)).toBe("CC-ORDER-OLD");
  expect(savings).toHaveLength(1);
  expect(savings[0].sourceSheetId).toBe("2504001");
  expect(savings[0].conceptOriginal).toBe("LIQUIDACION CUENTA PRUEBA");
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
