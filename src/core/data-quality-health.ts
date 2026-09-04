import {
  OFFICIAL_BANK_SOURCE_HEADERS,
  OfficialSourceContractError,
  buildOfficialSourceSchemaFingerprint,
  parseOfficialSourceRow,
  validateOfficialSourceHeaders,
  type SourceCellValue,
} from "../domain/official-bank-source";

export type DataQualityCheck = { name: string; passed: boolean };
export type DataQualityHealth = {
  status: "ok" | "failed";
  passed: number;
  total: number;
  checks: DataQualityCheck[];
};

const baseRow: SourceCellValue[] = [
  "CC-TEST-1",
  46267,
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Gasto",
  "Vivienda",
  "Suministros",
  "RECIBO DE PRUEBA",
  "RECIBO DE PRUEBA",
  "COMERCIO PRUEBA",
  -0.07,
  1888.27,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Documento de prueba",
];

function errorCode(callback: () => unknown) {
  try {
    callback();
    return null;
  } catch (error) {
    return error instanceof OfficialSourceContractError ? error.code : "unexpected";
  }
}

export function runDataQualityHealthChecks(): DataQualityHealth {
  const schemaFingerprint = validateOfficialSourceHeaders(OFFICIAL_BANK_SOURCE_HEADERS);
  const parsed = parseOfficialSourceRow({
    sourceFileId: "official-source-test",
    sourceSheetId: "725351515",
    sheetTitle: "Cuenta corriente · 3967",
    values: baseRow,
  });

  const categoryChanged: SourceCellValue[] = [...baseRow];
  categoryChanged[8] = "Otra categoría";
  const parsedCategoryChanged = parseOfficialSourceRow({
    sourceFileId: "official-source-test",
    sourceSheetId: "725351515",
    sheetTitle: "Cuenta corriente · 3967",
    values: categoryChanged,
  });

  const reviewRequired: SourceCellValue[] = [...baseRow];
  reviewRequired[19] = "Sí";
  const parsedReviewRequired = parseOfficialSourceRow({
    sourceFileId: "official-source-test",
    sourceSheetId: "725351515",
    sheetTitle: "Cuenta corriente · 3967",
    values: reviewRequired,
  });

  const transferRow: SourceCellValue[] = [...baseRow];
  transferRow[7] = "Traspaso interno";
  const parsedTransfer = parseOfficialSourceRow({
    sourceFileId: "official-source-test",
    sourceSheetId: "725351515",
    sheetTitle: "Cuenta corriente · 3967",
    values: transferRow,
  });

  const badHeaders: unknown[] = [...OFFICIAL_BANK_SOURCE_HEADERS];
  badHeaders[10] = "Concepto";

  const unknownMovement: SourceCellValue[] = [...baseRow];
  unknownMovement[7] = "Tipo nuevo";

  const unsafeMoney: SourceCellValue[] = [...baseRow];
  unsafeMoney[13] = "1,001";

  const accountMismatch: SourceCellValue[] = [...baseRow];
  accountMismatch[5] = "****9999";

  const checks: DataQualityCheck[] = [
    {
      name: "official-source-schema-exact-22-columns",
      passed:
        schemaFingerprint.length === 64 &&
        schemaFingerprint === buildOfficialSourceSchemaFingerprint(OFFICIAL_BANK_SOURCE_HEADERS),
    },
    {
      name: "source-schema-change-is-rejected",
      passed: errorCode(() => validateOfficialSourceHeaders(badHeaders)) === "schema_mismatch",
    },
    {
      name: "google-sheets-date-serial-is-deterministic",
      passed: parsed.observation.bankDate === "2026-09-02",
    },
    {
      name: "money-is-converted-to-safe-cents",
      passed: parsed.observation.amountCents === -7 && parsed.observation.balanceAfterCents === 188827,
    },
    {
      name: "known-source-kind-is-mapped-without-guessing",
      passed: parsed.transactionKind === "expense" && parsedTransfer.transactionKind === "transfer",
    },
    {
      name: "unknown-source-kind-is-rejected",
      passed:
        errorCode(() =>
          parseOfficialSourceRow({
            sourceFileId: "official-source-test",
            sourceSheetId: "725351515",
            sheetTitle: "Cuenta corriente · 3967",
            values: unknownMovement,
          }),
        ) === "unknown_movement_type",
    },
    {
      name: "source-review-flag-becomes-needs-review",
      passed: parsed.reviewState === "pending" && parsedReviewRequired.reviewState === "needs_review",
    },
    {
      name: "full-source-payload-changes-fingerprint-not-identity",
      passed:
        parsed.sourceRowIdentity === parsedCategoryChanged.sourceRowIdentity &&
        parsed.sourceFingerprint !== parsedCategoryChanged.sourceFingerprint,
    },
    {
      name: "unsafe-money-precision-is-rejected",
      passed:
        errorCode(() =>
          parseOfficialSourceRow({
            sourceFileId: "official-source-test",
            sourceSheetId: "725351515",
            sheetTitle: "Cuenta corriente · 3967",
            values: unsafeMoney,
          }),
        ) === "invalid_money",
    },
    {
      name: "unknown-account-sheet-is-rejected",
      passed:
        errorCode(() =>
          parseOfficialSourceRow({
            sourceFileId: "official-source-test",
            sourceSheetId: "725351515",
            sheetTitle: "Cuenta nueva · 9999",
            values: baseRow,
          }),
        ) === "unknown_account_sheet",
    },
    {
      name: "verified-account-contract-change-is-rejected",
      passed:
        errorCode(() =>
          parseOfficialSourceRow({
            sourceFileId: "official-source-test",
            sourceSheetId: "725351515",
            sheetTitle: "Cuenta corriente · 3967",
            values: accountMismatch,
          }),
        ) === "account_contract_mismatch",
    },
    {
      name: "source-payload-preserves-all-original-columns",
      passed:
        Object.keys(parsed.sourcePayload).length === OFFICIAL_BANK_SOURCE_HEADERS.length &&
        parsed.sourcePayload["Categoría"] === "Vivienda" &&
        parsed.sourcePayload["Fuente"] === "Documento de prueba",
    },
  ];

  const passed = checks.filter((check) => check.passed).length;
  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
