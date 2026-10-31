import {
  OFFICIAL_BANK_SOURCE_HEADERS, parseOfficialSourceRow,
  type OfficialBankSourceHeader, type SourceCellValue,
} from "../domain/official-bank-source";
import {
  reconcileOfficialSourcePostflight,
  type SourcePostflightReport,
  type SourcePostflightRow,
} from "../domain/source-postflight-reconciliation";
import { decodePersistedSourcePostflight } from "./source-postflight-report";
import {
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
  type PreparedSourceSyncBatch,
} from "./source-sync-service";

/** Release diagnostic only. It does not relax postflight or prepare a write batch. */
export type SourceDateRepresentationAudit = {
  scope: "supplied_snapshots_only";
  baselineClassification: "exact" | "date_representation_only" | "auxiliary_metadata_only" | "blocked";
  sourceRows: number;
  persistedRows: number;
  exactRows: number;
  dateRepresentationRows: number;
  auxiliaryMetadataRows?: number;
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

type ApprovedAuxiliarySourceOptions = {
  /** Explicitly restricted to the owner-confirmed append-only import path. */
  allowAuxiliaryMetadataChanges?: boolean;
};

type AuditedDifference = "exact" | "date" | "auxiliary" | "blocked";

/**
 * Never update the historical source payload: eligible non-financial changes
 * only cause the persisted original bytes and SHA to be reused in the batch.
 * This opt-in covers Hora and Notas as strings/null, never financial,
 * category, merchant, review, product or free-form new columns.
 */
function classifyOriginalDifference(
  current: AuditedRow,
  previous: AuditedRow,
  options: ApprovedAuxiliarySourceOptions = {},
): AuditedDifference {
  if (!sameFinancialFields(current, previous)) return "blocked";
  const identicalCells = OFFICIAL_BANK_SOURCE_HEADERS.every(
    field => Object.is(current.sourcePayload[field], previous.sourcePayload[field]),
  );
  if (identicalCells) {
    return current.sourceFingerprint === previous.sourceFingerprint ? "exact" : "blocked";
  }
  const originalDate = previous.sourcePayload.Fecha;
  const googleDate = current.sourcePayload.Fecha;
  const dateChanged = !Object.is(originalDate, googleDate);
  if (dateChanged && !(typeof originalDate === "string"
    && /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(originalDate)
    && typeof googleDate === "number" && Number.isInteger(googleDate)
    && googleDate >= 1 && googleDate <= 100_000)) return "blocked";

  let auxiliaryChanged = false;
  for (const field of OFFICIAL_BANK_SOURCE_HEADERS) {
    if (field === "Fecha") continue;
    const before = previous.sourcePayload[field];
    const after = current.sourcePayload[field];
    if (Object.is(before, after)) continue;
    if (!options.allowAuxiliaryMetadataChanges || (field !== "Hora" && field !== "Notas")
      || !(before === null || typeof before === "string")
      || !(after === null || typeof after === "string")) return "blocked";
    auxiliaryChanged = true;
  }
  return auxiliaryChanged ? "auxiliary" : dateChanged ? "date" : "blocked";
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
  options: ApprovedAuxiliarySourceOptions = {},
): SourceDateRepresentationAudit {
  try {
    const prepared = prepareOfficialSourceSyncBatch(snapshot);
    if (prepared.observations.length > 10_000) throw new SourceDateRepresentationAuditError();
    const stored = decodeStoredRows(persisted, snapshot);
    const byIdentity = new Map(stored.map(row => [identity(row), row]));
    let exactRows = 0;
    let dateRepresentationRows = 0;
    let auxiliaryMetadataRows = 0;
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
      const disposition = classifyOriginalDifference(current, previous, options);
      if (disposition === "exact") exactRows++;
      else if (disposition === "date") dateRepresentationRows++;
      else if (disposition === "auxiliary") auxiliaryMetadataRows++;
      else changedRows++;
    }
    const orphanRows = byIdentity.size;
    return {
      scope: "supplied_snapshots_only",
      baselineClassification: stored.length === 0 || changedRows > 0 || orphanRows > 0
        ? "blocked" : auxiliaryMetadataRows > 0 ? "auxiliary_metadata_only"
          : dateRepresentationRows > 0 ? "date_representation_only" : "exact",
      sourceRows: prepared.observations.length,
      persistedRows: stored.length,
      exactRows, dateRepresentationRows, changedRows, pendingRows, orphanRows,
      ...(options.allowAuxiliaryMetadataChanges ? { auxiliaryMetadataRows } : {}),
    };
  } catch {
    throw new SourceDateRepresentationAuditError();
  }
}


/**
 * REC-SYNC-400: prepare an APPEND-ONLY candidate from independent, complete
 * Google and persisted-original snapshots. This is a pure function: it never
 * writes either source. Existing source fingerprints and their 22 original
 * typed cells are preserved, even if Google now renders an equivalent date
 * as an integer serial. Any other difference blocks the entire operation.
 *
 * This does not grant permission to import: caller must still verify fresh
 * source preflight, auth, gateway compatibility, backup and SQL rollback.
 */
export type VerifiedAppendOnlySourcePlan = {
  batch: PreparedSourceSyncBatch;
  audit: SourceDateRepresentationAudit;
  preservedRepresentationRows: number;
  preservedAuxiliaryRows?: number;
};

export function prepareVerifiedAppendOnlySourcePlan(
  snapshot: OfficialSourceWorkbookSnapshot,
  persistedOriginals: unknown,
  options: ApprovedAuxiliarySourceOptions = {},
): VerifiedAppendOnlySourcePlan {
  try {
    const audit = auditOfficialSourceDateRepresentations(snapshot, persistedOriginals, options);
    if (audit.baselineClassification === "blocked"
      || audit.persistedRows === 0 || audit.orphanRows !== 0 || audit.changedRows !== 0
      || audit.exactRows + audit.dateRepresentationRows + (audit.auxiliaryMetadataRows ?? 0) !== audit.persistedRows
      || audit.persistedRows + audit.pendingRows !== audit.sourceRows) {
      throw new SourceDateRepresentationAuditError();
    }

    const stored = decodeStoredRows(persistedOriginals, snapshot);
    const byIdentity = new Map(stored.map(row => [identity(row), row]));
    const fresh = prepareOfficialSourceSyncBatch(snapshot);
    let preservedRepresentationRows = 0;
    let preservedAuxiliaryRows = 0;
    const observations = fresh.observations.map(observation => {
      const key = identity({ ...observation, sourceFileId: fresh.sourceFileId });
      const previous = byIdentity.get(key);
      if (!previous) return observation; // New row: preserve Google's exact 22 cells.
      if (!sameFinancialFields(previous, observation)) {
        throw new SourceDateRepresentationAuditError();
      }
      const disposition = classifyOriginalDifference({
        ...observation,
        sourceFileId: fresh.sourceFileId,
      }, previous, options);
      if (disposition === "exact") return observation;
      if (disposition !== "date" && disposition !== "auxiliary") {
        throw new SourceDateRepresentationAuditError();
      }
      if (disposition === "date") preservedRepresentationRows++;
      else preservedAuxiliaryRows++;
      // Keep the EXACT immutable original, never replace it with the Google
      // serial or weaken the ingestion function's fingerprint guard.
      return {
        ...observation,
        sourceFingerprint: previous.sourceFingerprint,
        sourcePayload: previous.sourcePayload,
      };
    });
    if (preservedRepresentationRows !== audit.dateRepresentationRows
      || preservedAuxiliaryRows !== (audit.auxiliaryMetadataRows ?? 0)) {
      throw new SourceDateRepresentationAuditError();
    }
    return {
      batch: { ...fresh, observations },
      audit,
      preservedRepresentationRows,
      ...(options.allowAuxiliaryMetadataChanges ? { preservedAuxiliaryRows } : {}),
    };
  } catch {
    throw new SourceDateRepresentationAuditError();
  }
}

/**
 * REC-SYNC-401: after the candidate SQL transaction, validate the complete
 * independently read, eight-column gateway postflight against the CANONICAL
 * append-only plan. This never accepts a missing row or silent revision.
 * The raw Google snapshot may still have a representational date difference;
 * that is explicitly counted by plan.audit rather than silently ignored.
 */
export function verifyPlannedAppendOnlyPostflight(
  plan: VerifiedAppendOnlySourcePlan,
  independentGatewayResult: unknown,
): SourcePostflightReport {
  const expected = plan.batch.observations.map(row => ({
    sourceFileId: plan.batch.sourceFileId,
    sourceSheetId: row.sourceSheetId,
    sourceRowKey: row.sourceRowKey,
    sourceFingerprint: row.sourceFingerprint,
    accountExternalKey: row.accountExternalKey,
    bankDate: row.bankDate,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
  }));
  const persisted = decodePersistedSourcePostflight(
    independentGatewayResult, plan.batch.sourceFileId,
  );
  return reconcileOfficialSourcePostflight(expected, persisted);
}
