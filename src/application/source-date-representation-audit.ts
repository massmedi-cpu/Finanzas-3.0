import {
  OFFICIAL_BANK_SOURCE_HEADERS, parseOfficialSourceRow,
  type OfficialBankSourceHeader, type SourceCellValue,
} from "../domain/official-bank-source";
import type { SourcePostflightRow } from "../domain/source-postflight-reconciliation";
import { decodePersistedSourcePostflight } from "./source-postflight-report";
import { prepareOfficialSourceSyncBatch, type OfficialSourceWorkbookSnapshot } from "./source-sync-service";

/** Release diagnostic only. It does not relax postflight or prepare a write batch. */
export type SourceDateRepresentationAudit = {
  scope: "supplied_snapshots_only";
  baselineClassification: "exact" | "date_representation_only" | "blocked";
  sourceRows: number;
  persistedRows: number;
  exactRows: number;
  dateRepresentationRows: number;
  changedRows: number;
  pendingRows: number;
  orphanRows: number;
};

type AuditedRow = SourcePostflightRow & {
  sourcePayload: Readonly<Record<OfficialBankSourceHeader, SourceCellValue>>;
};

const ROW_KEYS = [
  "source_file_id", "source_sheet_id", "source_row_key", "source_fingerprint",
  "account_external_key", "bank_date", "amount_cents", "balance_after_cents", "source_payload",
  "concept_original", "source_row_identity",
] as const;

export class SourceDateRepresentationAuditError extends Error {
  constructor() {
    // Never include a row, payload, identity, account, or upstream parser error.
    super("source_date_representation_audit_invalid_snapshot");
    this.name = "SourceDateRepresentationAuditError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function identity(row: SourcePostflightRow) {
  return JSON.stringify([row.sourceFileId, row.sourceSheetId, row.sourceRowKey]);
}

function sameFinancialFields(left: SourcePostflightRow, right: Pick<SourcePostflightRow,
  "accountExternalKey" | "bankDate" | "amountCents" | "balanceAfterCents">) {
  return left.accountExternalKey === right.accountExternalKey
    && left.bankDate === right.bankDate
    && left.amountCents === right.amountCents
    && left.balanceAfterCents === right.balanceAfterCents;
}

function decodeStoredRows(input: unknown, snapshot: OfficialSourceWorkbookSnapshot): AuditedRow[] {
  if (!record(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, "rows")
    || !Array.isArray(input.rows) || input.rows.length > 10_000) {
    throw new SourceDateRepresentationAuditError();
  }
  const result: AuditedRow[] = [];
  const seen = new Set<string>();
  for (const raw of input.rows) {
    if (!record(raw) || Object.keys(raw).length !== ROW_KEYS.length
      || ROW_KEYS.some(key => !Object.hasOwn(raw, key)) || !record(raw.source_payload)) {
      throw new SourceDateRepresentationAuditError();
    }
    const payload = raw.source_payload;
    if (Object.keys(payload).length !== OFFICIAL_BANK_SOURCE_HEADERS.length
      || OFFICIAL_BANK_SOURCE_HEADERS.some(key => !Object.hasOwn(payload, key))) {
      throw new SourceDateRepresentationAuditError();
    }
    for (const value of Object.values(payload)) {
      if (value !== null && typeof value !== "string" && typeof value !== "boolean"
        && !(typeof value === "number" && Number.isFinite(value))) {
        throw new SourceDateRepresentationAuditError();
      }
    }
    // Keep the existing v3 postflight decoder and its eight-column allowlist intact.
    const { source_payload: _payload, concept_original: conceptOriginal,
      source_row_identity: sourceRowIdentity, ...metadata } = raw;
    const [decoded] = decodePersistedSourcePostflight({ rows: [metadata] }, snapshot.sourceFileId);
    const sheet = snapshot.sheets.find(item => item.sourceSheetId === decoded.sourceSheetId);
    if (!sheet) throw new SourceDateRepresentationAuditError();
    const parsed = parseOfficialSourceRow({
      sourceFileId: decoded.sourceFileId, sourceSheetId: decoded.sourceSheetId,
      sheetTitle: sheet.title,
      values: OFFICIAL_BANK_SOURCE_HEADERS.map(key => payload[key]),
    });
    // Recompute the hash from all 22 ORIGINAL cells and independently validate
    // every persisted financial field. No trimming/type coercion is accepted here.
    if (parsed.sourceFingerprint !== decoded.sourceFingerprint
      || parsed.observation.sourceRowKey !== decoded.sourceRowKey
      || parsed.sourceRowIdentity !== sourceRowIdentity
      || parsed.observation.conceptOriginal !== conceptOriginal
      || !sameFinancialFields(decoded, parsed.observation)
      || OFFICIAL_BANK_SOURCE_HEADERS.some(key => !Object.is(payload[key], parsed.sourcePayload[key]))) {
      throw new SourceDateRepresentationAuditError();
    }
    const key = identity(decoded);
    if (seen.has(key)) throw new SourceDateRepresentationAuditError();
    seen.add(key);
    result.push({ ...decoded, sourcePayload: parsed.sourcePayload });
  }
  return result;
}

/**
 * Compare the complete authoritative source snapshot to a separately read set of
 * stored originals. Only the observed direction DD/MM/YYYY -> integer Sheets
 * serial is eligible. Both dates must independently parse to the same day, and
 * the other 21 typed cells must be exactly equal. The returned aggregate contains
 * no bank data and is NOT evidence of a completed sync or permission to mutate.
 */
export function auditOfficialSourceDateRepresentations(
  snapshot: OfficialSourceWorkbookSnapshot,
  persisted: unknown,
): SourceDateRepresentationAudit {
  try {
    const prepared = prepareOfficialSourceSyncBatch(snapshot);
    if (prepared.observations.length > 10_000) throw new SourceDateRepresentationAuditError();
    const stored = decodeStoredRows(persisted, snapshot);
    const byIdentity = new Map(stored.map(row => [identity(row), row]));
    let exactRows = 0;
    let dateRepresentationRows = 0;
    let changedRows = 0;
    let pendingRows = 0;
    for (const observation of prepared.observations) {
      const current: AuditedRow = {
        ...observation, sourceFileId: prepared.sourceFileId,
        sourcePayload: observation.sourcePayload as AuditedRow["sourcePayload"],
      };
      const key = identity(current);
      const previous = byIdentity.get(key);
      if (!previous) {
        pendingRows++;
        continue;
      }
      byIdentity.delete(key);
      const sameFinance = sameFinancialFields(current, previous);
      const sameCells = OFFICIAL_BANK_SOURCE_HEADERS.every(
        field => Object.is(current.sourcePayload[field], previous.sourcePayload[field]),
      );
      if (sameFinance && sameCells && current.sourceFingerprint === previous.sourceFingerprint) {
        exactRows++;
        continue;
      }
      const originalDate = previous.sourcePayload.Fecha;
      const currentDate = current.sourcePayload.Fecha;
      const dateOnly = typeof originalDate === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(originalDate)
        && typeof currentDate === "number" && Number.isInteger(currentDate)
        && currentDate >= 1 && currentDate <= 100_000
        && sameFinance
        && OFFICIAL_BANK_SOURCE_HEADERS.every(field => field === "Fecha"
          || Object.is(current.sourcePayload[field], previous.sourcePayload[field]));
      if (dateOnly) dateRepresentationRows++;
      else changedRows++;
    }
    const orphanRows = byIdentity.size;
    return {
      scope: "supplied_snapshots_only",
      baselineClassification: stored.length === 0 || changedRows > 0 || orphanRows > 0
        ? "blocked" : dateRepresentationRows > 0 ? "date_representation_only" : "exact",
      sourceRows: prepared.observations.length,
      persistedRows: stored.length,
      exactRows, dateRepresentationRows, changedRows, pendingRows, orphanRows,
    };
  } catch {
    throw new SourceDateRepresentationAuditError();
  }
}
