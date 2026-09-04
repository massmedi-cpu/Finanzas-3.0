import { expect, test } from "@playwright/test";
import {
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
} from "../../src/application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";

const currentRow: SourceCellValue[] = [
  "CC-MIXED-1",
  46267,
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Ingreso",
  "Otros ingresos",
  "Prueba",
  "INGRESO CORRIENTE",
  "INGRESO CORRIENTE",
  "Openbank",
  1,
  101,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Documento corriente",
];

const staleSavingsCopy: SourceCellValue[] = [
  "AH-MIXED-1",
  46223,
  null,
  "Cuenta ahorro Openbank · 2504",
  "Openbank",
  "****2504",
  "Cuenta bancaria",
  "Ingreso",
  "Ingresos financieros",
  "Intereses cuenta ahorro",
  "LIQUIDACION AHORRO ANTIGUA",
  "LIQUIDACION AHORRO",
  "Openbank",
  2,
  202,
  "Abono de intereses",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Copia histórica incrustada",
];

const prepaidRow: SourceCellValue[] = [
  "TP-MIXED-1",
  46100,
  null,
  "Tarjeta prepago Openbank · 8403",
  "Openbank",
  "****8403",
  "Tarjeta",
  "Gasto",
  "Compras diversas",
  "Compra online",
  "COMPRA PREPAGO",
  "COMPRA PREPAGO",
  "Comercio prueba",
  -3,
  null,
  "Tarjeta prepago",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Ledger técnico cerrado",
];

const canonicalSavingsRow: SourceCellValue[] = [
  "AH-MIXED-1",
  46223,
  null,
  "Cuenta ahorro Openbank · 2504",
  "Openbank",
  "****2504",
  "Cuenta bancaria",
  "Ingreso",
  "Ingresos financieros",
  "Intereses cuenta ahorro",
  "LIQUIDACION AHORRO CANONICA",
  "LIQUIDACION AHORRO",
  "Openbank",
  2,
  202,
  "Abono de intereses",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Fila canónica de ahorro",
];

function mixedWorkbook(): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "official-mixed-products-test",
    sourceRevision: "revision-mixed-products-test",
    sheets: [
      {
        sourceSheetId: "725351515",
        title: "Cuenta corriente · 3967",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [currentRow, staleSavingsCopy, prepaidRow],
      },
      {
        sourceSheetId: "2504001",
        title: "Cuenta ahorro · 2504",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [canonicalSavingsRow],
      },
    ],
  };
}

test("separa las dos pestañas físicas de los tres productos lógicos", () => {
  const prepared = prepareOfficialSourceSyncBatch(mixedWorkbook());

  expect(prepared.accounts).toHaveLength(3);
  expect(prepared.observations).toHaveLength(3);
  expect(prepared.accounts.map((account) => account.accountName)).toEqual([
    "Cuenta corriente Openbank · 3967",
    "Cuenta ahorro Openbank · 2504",
    "Tarjeta prepago Openbank · 8403",
  ]);
});

test("prefiere la fila canónica de ahorro y no duplica la copia histórica incrustada", () => {
  const prepared = prepareOfficialSourceSyncBatch(mixedWorkbook());
  const savings = prepared.observations.filter(
    (row) => row.accountExternalKey === "Cuenta ahorro Openbank · 2504",
  );

  expect(savings).toHaveLength(1);
  expect(savings[0].sourceSheetId).toBe("2504001");
  expect(savings[0].sourcePayload["Concepto original"]).toBe("LIQUIDACION AHORRO CANONICA");
  expect(savings[0].sourceRowIdentity).toBe(
    "official-mixed-products-test::2504001::AH-MIXED-1",
  );
});

test("mantiene la prepago como ledger técnico archivado con saldo inicial cerrado", () => {
  const prepared = prepareOfficialSourceSyncBatch(mixedWorkbook());
  const prepaid = prepared.accounts.find(
    (account) => account.accountName === "Tarjeta prepago Openbank · 8403",
  );

  expect(prepaid).toMatchObject({
    accountType: "other",
    lifecycle: "archived",
    openingBalanceCents: 0,
    sourceIdentifier: "****8403",
  });
});
