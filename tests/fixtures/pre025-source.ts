import {
  OFFICIAL_BANK_SOURCE_HEADERS,
  type SourceCellValue,
} from "../../src/domain/official-bank-source";
import type { OfficialSourceWorkbookSnapshot } from "../../src/application/source-sync-service";

type Product = "checking" | "savings";

export function pre025SourceRow({
  key,
  product,
  amount = 0,
  balance = 1_000,
}: {
  key: string;
  product: Product;
  amount?: number;
  balance?: number | null;
}): SourceCellValue[] {
  const savings = product === "savings";
  return [
    key,
    "2026-09-01",
    null,
    savings ? "Cuenta ahorro Openbank · 2504" : "Cuenta corriente Openbank · 3967",
    "Openbank",
    savings ? "****2504" : "****3967",
    "Cuenta bancaria",
    "Gasto",
    "Prueba",
    "Capacidad",
    `MOVIMIENTO ${key}`,
    `MOVIMIENTO ${key}`,
    "Comercio",
    amount,
    balance,
    "Cuenta",
    null,
    null,
    "No aplica",
    "No",
    null,
    "Fixture PRE-025",
  ];
}

export function pre025Workbook(observationCount: number): OfficialSourceWorkbookSnapshot {
  if (!Number.isInteger(observationCount) || observationCount < 2) {
    throw new Error("pre025_workbook_requires_two_observations");
  }

  const checkingRows = Array.from({ length: observationCount - 1 }, (_, index) =>
    pre025SourceRow({
      key: `CC-PRE025-${String(index + 1).padStart(5, "0")}`,
      product: "checking",
    }),
  );

  return {
    sourceFileId: "pre025-capacity-source",
    sourceRevision: `pre025-${observationCount}`,
    sheets: [
      {
        sourceSheetId: "725351515",
        title: "Cuenta corriente · 3967",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: checkingRows,
      },
      {
        sourceSheetId: "2504001",
        title: "Cuenta ahorro · 2504",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [pre025SourceRow({ key: "AH-PRE025-00001", product: "savings" })],
      },
    ],
  };
}
