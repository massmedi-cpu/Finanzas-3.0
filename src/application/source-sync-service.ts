import { createHash } from "node:crypto";
import type { AccountType, SyncIssueSeverity, TransactionKind, TransactionReviewState } from "../domain/models";
import {
  OFFICIAL_SOURCE_ACCOUNT_CONTRACTS,
  OfficialSourceContractError,
  parseOfficialSourceRow,
  validateOfficialSourceHeaders,
  type SourceCellValue,
} from "../domain/official-bank-source";

export type OfficialSourceSheetSnapshot = {
  sourceSheetId: string;
  title: string;
  headers: readonly unknown[];
  rows: readonly (readonly unknown[])[];
};

export type OfficialSourceWorkbookSnapshot = {
  sourceFileId: string;
  sourceRevision: string | null;
  sheets: readonly OfficialSourceSheetSnapshot[];
};

export type PreparedSourceAccount = {
  sourceFileId: string;
  accountExternalKey: string;
  accountName: string;
  institution: string;
  accountType: AccountType;
  openingBalanceCents: number;
  sourceIdentifier: string;
};

export type PreparedSourceObservation = {
  sourceSheetId: string;
  sourceRowKey: string;
  sourceRowIdentity: string;
  sourceFingerprint: string;
  sourcePayload: Readonly<Record<string, SourceCellValue>>;
  bankDate: string;
  conceptOriginal: string;
  conceptNormalized: string;
  amountCents: number;
  balanceAfterCents: number | null;
  accountExternalKey: string;
  transactionKind: TransactionKind;
  reviewState: TransactionReviewState;
};

export type PreparedSourceSyncBatch = {
  sourceFileId: string;
  sourceRevision: string | null;
  schemaFingerprint: string;
  accounts: PreparedSourceAccount[];
  observations: PreparedSourceObservation[];
};

export type SourceSyncBatchResult = {
  syncRunId: string;
  status: "success";
  rowsSeen: number;
  rowsInserted: number;
  rowsRevised: number;
  rowsSkipped: number;
  duplicatesDetected: number;
};

export type SourceSyncFailure = {
  sourceFileId: string;
  sourceRevision: string | null;
  severity: SyncIssueSeverity;
  issueCode: string;
  sourceSheetId: string | null;
  sourceRowKey: string | null;
  fieldName: string | null;
  message: string;
  details: Readonly<Record<string, unknown>> | null;
};

export interface SourceSyncPersistence {
  syncBatch(batch: PreparedSourceSyncBatch): Promise<SourceSyncBatchResult>;
  recordFailure(failure: SourceSyncFailure): Promise<{ syncRunId: string }>;
}

export class SourceWorkbookContractError extends Error {
  constructor(
    public readonly code:
      | "invalid_workbook_identity"
      | "sheet_set_mismatch"
      | "empty_source_sheet"
      | "duplicate_source_row_identity"
      | "opening_balance_unavailable",
    message: string,
    public readonly sourceSheetId: string | null = null,
    public readonly sourceRowKey: string | null = null,
  ) {
    super(message);
    this.name = "SourceWorkbookContractError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deriveOpeningBalanceCents(observations: readonly PreparedSourceObservation[]) {
  const oldest = observations.at(-1);
  if (!oldest || oldest.balanceAfterCents === null) {
    throw new SourceWorkbookContractError(
      "opening_balance_unavailable",
      "No se puede derivar el saldo inicial porque el movimiento más antiguo no contiene saldo posterior.",
      oldest?.sourceSheetId ?? null,
      oldest?.sourceRowKey ?? null,
    );
  }

  const opening = oldest.balanceAfterCents - oldest.amountCents;
  if (!Number.isSafeInteger(opening)) {
    throw new SourceWorkbookContractError(
      "opening_balance_unavailable",
      "El saldo inicial derivado excede el rango monetario seguro.",
      oldest.sourceSheetId,
      oldest.sourceRowKey,
    );
  }
  return opening;
}

export function prepareOfficialSourceSyncBatch(
  snapshot: OfficialSourceWorkbookSnapshot,
): PreparedSourceSyncBatch {
  if (!snapshot.sourceFileId.trim()) {
    throw new SourceWorkbookContractError(
      "invalid_workbook_identity",
      "La fuente oficial necesita un identificador de archivo estable.",
    );
  }

  const expectedTitles = Object.keys(OFFICIAL_SOURCE_ACCOUNT_CONTRACTS).sort();
  const actualTitles = snapshot.sheets.map((sheet) => sheet.title).sort();
  if (
    actualTitles.length !== expectedTitles.length ||
    actualTitles.some((title, index) => title !== expectedTitles[index])
  ) {
    throw new SourceWorkbookContractError(
      "sheet_set_mismatch",
      `El libro oficial debe contener exactamente estas pestañas: ${expectedTitles.join(", ")}.`,
    );
  }

  const seenIdentities = new Set<string>();
  const accounts: PreparedSourceAccount[] = [];
  const observations: PreparedSourceObservation[] = [];
  const schemaParts: string[] = [];

  for (const sheet of snapshot.sheets) {
    const headerFingerprint = validateOfficialSourceHeaders(sheet.headers);
    schemaParts.push(`${sheet.sourceSheetId}:${sheet.title}:${headerFingerprint}`);

    if (!sheet.rows.length) {
      throw new SourceWorkbookContractError(
        "empty_source_sheet",
        `La pestaña “${sheet.title}” no contiene movimientos.`,
        sheet.sourceSheetId,
      );
    }

    const parsedSheet = sheet.rows.map((values) =>
      parseOfficialSourceRow({
        sourceFileId: snapshot.sourceFileId,
        sourceSheetId: sheet.sourceSheetId,
        sheetTitle: sheet.title,
        values,
      }),
    );

    const preparedSheet: PreparedSourceObservation[] = parsedSheet.map((parsed) => {
      if (seenIdentities.has(parsed.sourceRowIdentity)) {
        throw new SourceWorkbookContractError(
          "duplicate_source_row_identity",
          `La identidad “${parsed.sourceRowIdentity}” aparece más de una vez en el libro.`,
          sheet.sourceSheetId,
          parsed.observation.sourceRowKey,
        );
      }
      seenIdentities.add(parsed.sourceRowIdentity);

      return {
        sourceSheetId: sheet.sourceSheetId,
        sourceRowKey: parsed.observation.sourceRowKey,
        sourceRowIdentity: parsed.sourceRowIdentity,
        sourceFingerprint: parsed.sourceFingerprint,
        sourcePayload: parsed.sourcePayload,
        bankDate: parsed.observation.bankDate,
        conceptOriginal: parsed.observation.conceptOriginal,
        conceptNormalized: parsed.conceptNormalized,
        amountCents: parsed.observation.amountCents,
        balanceAfterCents: parsed.observation.balanceAfterCents,
        accountExternalKey: parsed.observation.accountExternalKey,
        transactionKind: parsed.transactionKind,
        reviewState: parsed.reviewState,
      };
    });

    const contract = parsedSheet[0].accountContract;
    accounts.push({
      sourceFileId: snapshot.sourceFileId.trim(),
      accountExternalKey: contract.accountName,
      accountName: contract.accountName,
      institution: contract.institution,
      accountType: contract.accountType,
      openingBalanceCents: deriveOpeningBalanceCents(preparedSheet),
      sourceIdentifier: contract.identifier,
    });
    observations.push(...preparedSheet);
  }

  return {
    sourceFileId: snapshot.sourceFileId.trim(),
    sourceRevision: snapshot.sourceRevision?.trim() || null,
    schemaFingerprint: sha256(JSON.stringify(schemaParts.sort())),
    accounts,
    observations,
  };
}

function failureFromError(
  snapshot: OfficialSourceWorkbookSnapshot,
  error: unknown,
): SourceSyncFailure {
  if (error instanceof OfficialSourceContractError) {
    return {
      sourceFileId: snapshot.sourceFileId || "unknown-source",
      sourceRevision: snapshot.sourceRevision,
      severity: "error",
      issueCode: error.code,
      sourceSheetId: null,
      sourceRowKey: null,
      fieldName: error.field,
      message: error.message,
      details: null,
    };
  }
  if (error instanceof SourceWorkbookContractError) {
    return {
      sourceFileId: snapshot.sourceFileId || "unknown-source",
      sourceRevision: snapshot.sourceRevision,
      severity: "error",
      issueCode: error.code,
      sourceSheetId: error.sourceSheetId,
      sourceRowKey: error.sourceRowKey,
      fieldName: null,
      message: error.message,
      details: null,
    };
  }
  return {
    sourceFileId: snapshot.sourceFileId || "unknown-source",
    sourceRevision: snapshot.sourceRevision,
    severity: "error",
    issueCode: "unexpected_source_sync_error",
    sourceSheetId: null,
    sourceRowKey: null,
    fieldName: null,
    message: "La sincronización de la fuente ha fallado por un error no clasificado.",
    details: null,
  };
}

export class SourceSyncService {
  constructor(private readonly persistence: SourceSyncPersistence) {}

  async synchronize(snapshot: OfficialSourceWorkbookSnapshot) {
    let batch: PreparedSourceSyncBatch;
    try {
      batch = prepareOfficialSourceSyncBatch(snapshot);
    } catch (error) {
      await this.persistence.recordFailure(failureFromError(snapshot, error));
      throw error;
    }
    return this.persistence.syncBatch(batch);
  }
}
