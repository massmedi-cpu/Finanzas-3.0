import {
  prepareOfficialSourceSyncBatch, type OfficialSourceWorkbookSnapshot,
} from "./source-sync-service";
import {
  reconcileOfficialSourcePostflight,
  SourcePostflightError,
  type SourcePostflightReport, type SourcePostflightRow,
} from "../domain/source-postflight-reconciliation";

export type PersistencePostflightRow = {
  source_file_id: unknown;
  source_sheet_id: unknown;
  source_row_key: unknown;
  account_external_key: unknown;
  bank_date: unknown;
  amount_cents: unknown;
  balance_after_cents: unknown;
};

export type PersistencePostflightResponse = {
  rows: PersistencePostflightRow[];
};

function integerCents(value: unknown): number {
  // Postgres BIGINT is transmitted as decimal TEXT; never parse arbitrary
  // floating point/scientific notation or truncate an out-of-range bigint.
  if (typeof value !== "number" && typeof value !== "string") {
    throw new SourcePostflightError("source_postflight_invalid_record");
  }
  const literal = String(value);
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(literal)) {
    throw new SourcePostflightError("source_postflight_invalid_record");
  }
  const numberValue = Number(literal);
  if (!Number.isSafeInteger(numberValue)) {
    throw new SourcePostflightError("source_postflight_invalid_record");
  }
  return numberValue;
}

/**
 * Parse only allowlisted gateway columns. The response shape and ALL its rows
 * must be valid before even attempting reconciliation; no silent truncation.
 */
export function decodePersistedSourcePostflight(
  input: unknown, expectedSourceFileId: string,
): SourcePostflightRow[] {
  if (!expectedSourceFileId.trim() || !input || typeof input !== "object"
    || !("rows" in input) || !Array.isArray(input.rows)
    || input.rows.length > 10_000 || Object.hasOwn(input, "truncated")) {
    throw new SourcePostflightError("source_postflight_invalid_record");
  }
  const rows: SourcePostflightRow[] = [];
  for (const value of input.rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SourcePostflightError("source_postflight_invalid_record");
    }
    const raw = value as PersistencePostflightRow;
    if (raw.source_file_id !== expectedSourceFileId
      || typeof raw.source_sheet_id !== "string"
      || typeof raw.source_row_key !== "string"
      || typeof raw.account_external_key !== "string"
      || typeof raw.bank_date !== "string") {
      throw new SourcePostflightError("source_postflight_invalid_record");
    }
    rows.push({
      sourceFileId: expectedSourceFileId,
      sourceSheetId: raw.source_sheet_id,
      sourceRowKey: raw.source_row_key,
      accountExternalKey: raw.account_external_key,
      bankDate: raw.bank_date,
      amountCents: integerCents(raw.amount_cents),
      balanceAfterCents: raw.balance_after_cents === null
        ? null : integerCents(raw.balance_after_cents),
    });
  }
  return rows;
}

export function buildSourcePostflightReport(
  snapshot: OfficialSourceWorkbookSnapshot,
  gatewayResult: unknown,
): SourcePostflightReport {
  const prepared = prepareOfficialSourceSyncBatch(snapshot);
  const persisted = decodePersistedSourcePostflight(gatewayResult, prepared.sourceFileId);
  return reconcileOfficialSourcePostflight(
    prepared.observations.map(row => ({
      sourceFileId: prepared.sourceFileId,
      sourceSheetId: row.sourceSheetId,
      sourceRowKey: row.sourceRowKey,
      accountExternalKey: row.accountExternalKey,
      bankDate: row.bankDate,
      amountCents: row.amountCents,
      balanceAfterCents: row.balanceAfterCents,
    })),
    persisted,
  );
}
