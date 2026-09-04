import { createHash } from "node:crypto";
import type {
  AccountType,
  EntityLifecycle,
  SyncIssueSeverity,
  TransactionKind,
  TransactionReviewState,
} from "../domain/models";
import {
  OFFICIAL_SOURCE_ACCOUNT_CONTRACTS,
  OFFICIAL_SOURCE_SHEET_TITLES,
  OfficialSourceContractError,
  parseOfficialSourceRow,
  validateOfficialSourceHeaders,
  type OfficialSourceAccountContract,
  type ParsedOfficialSourceRow,
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
  lifecycle: EntityLifecycle;
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
  rowsMissing: number;
  duplicatesDetected: number;
  warningsCount: number;
  cursorsAdvanced: number;
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
      | "source_order_mismatch"
      | "duplicate_source_row_identity"
      | "ambiguous_product_fallback"
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

function validateNewestFirstSourceOrder(
  sourceSheetId: string,
  sheetTitle: string,
  rows: readonly ParsedOfficialSourceRow[],
) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (current.observation.bankDate > previous.observation.bankDate) {
      throw new SourceWorkbookContractError(
        "source_order_mismatch",
        `La pestaña “${sheetTitle}” debe conservar el orden de fecha más reciente a más antigua. Se detiene la importación para no calcular un saldo inicial incorrecto.`,
        sourceSheetId,
        current.observation.sourceRowKey,
      );
    }
  }
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

type ParsedSheet = {
  sourceSheetId: string;
  title: string;
  rows: ParsedOfficialSourceRow[];
};

function selectAuthoritativeRowsForProduct(
  contract: OfficialSourceAccountContract,
  parsedSheets: readonly ParsedSheet[],
) {
  const matchingSheets = parsedSheets
    .map((sheet) => ({
      ...sheet,
      rows: sheet.rows.filter((row) => row.accountContract.accountName === contract.accountName),
    }))
    .filter((sheet) => sheet.rows.length > 0);

  if (!matchingSheets.length) return [];

  const canonical = matchingSheets.find((sheet) => sheet.title === contract.canonicalSheetTitle);
  if (canonical) {
    return canonical.rows;
  }

  if (matchingSheets.length !== 1) {
    throw new SourceWorkbookContractError(
      "ambiguous_product_fallback",
      `El producto “${contract.accountName}” no aparece en su pestaña canónica y existe en varias pestañas alternativas. Se detiene la importación en lugar de elegir una copia por heurística.`,
    );
  }

  return matchingSheets[0].rows;
}

function prepareProductObservations(rows: readonly ParsedOfficialSourceRow[]) {
  const seenSourceRowKeys = new Set<string>();

  return rows.map((parsed) => {
    const sourceRowKey = parsed.observation.sourceRowKey;
    if (seenSourceRowKeys.has(sourceRowKey)) {
      throw new SourceWorkbookContractError(
        "duplicate_source_row_identity",
        `El ID origen “${sourceRowKey}” aparece más de una vez en la copia autoritativa del producto “${parsed.accountContract.accountName}”.`,
        parsed.observation.sourceSheetId,
        sourceRowKey,
      );
    }
    seenSourceRowKeys.add(sourceRowKey);

    return {
      sourceSheetId: parsed.observation.sourceSheetId ?? "",
      sourceRowKey,
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
    } satisfies PreparedSourceObservation;
  });
}

function openingBalanceForContract(
  contract: OfficialSourceAccountContract,
  observations: readonly PreparedSourceObservation[],
) {
  if (contract.openingBalanceMode === "closed_technical_ledger") return 0;
  return deriveOpeningBalanceCents(observations);
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

  const expectedTitles = [...OFFICIAL_SOURCE_SHEET_TITLES].sort();
  const actualTitles = snapshot.sheets.map((sheet) => sheet.title).sort();
  if (
    actualTitles.length !== expectedTitles.length ||
    actualTitles.some((title, index) => title !== expectedTitles[index])
  ) {
    throw new SourceWorkbookContractError(
      "sheet_set_mismatch",
      `El libro oficial debe contener exactamente estas pestañas físicas: ${expectedTitles.join(", ")}.`,
    );
  }

  const schemaParts: string[] = [];
  const parsedSheets: ParsedSheet[] = snapshot.sheets.map((sheet) => {
    const headerFingerprint = validateOfficialSourceHeaders(sheet.headers);
    schemaParts.push(`${sheet.sourceSheetId}:${sheet.title}:${headerFingerprint}`);

    if (!sheet.rows.length) {
      throw new SourceWorkbookContractError(
        "empty_source_sheet",
        `La pestaña “${sheet.title}” no contiene movimientos.`,
        sheet.sourceSheetId,
      );
    }

    const rows = sheet.rows.map((values) =>
      parseOfficialSourceRow({
        sourceFileId: snapshot.sourceFileId,
        sourceSheetId: sheet.sourceSheetId,
        sheetTitle: sheet.title,
        values,
      }),
    );
    validateNewestFirstSourceOrder(sheet.sourceSheetId, sheet.title, rows);

    return { sourceSheetId: sheet.sourceSheetId, title: sheet.title, rows };
  });

  const accounts: PreparedSourceAccount[] = [];
  const observations: PreparedSourceObservation[] = [];
  const seenIdentities = new Set<string>();

  for (const contract of Object.values(OFFICIAL_SOURCE_ACCOUNT_CONTRACTS)) {
    const authoritativeRows = selectAuthoritativeRowsForProduct(contract, parsedSheets);
    if (!authoritativeRows.length) continue;

    const preparedProduct = prepareProductObservations(authoritativeRows);
    for (const observation of preparedProduct) {
      if (seenIdentities.has(observation.sourceRowIdentity)) {
        throw new SourceWorkbookContractError(
          "duplicate_source_row_identity",
          `La identidad “${observation.sourceRowIdentity}” aparece más de una vez en el libro autoritativo.`,
          observation.sourceSheetId,
          observation.sourceRowKey,
        );
      }
      seenIdentities.add(observation.sourceRowIdentity);
    }

    accounts.push({
      sourceFileId: snapshot.sourceFileId.trim(),
      accountExternalKey: contract.accountName,
      accountName: contract.accountName,
      institution: contract.institution,
      accountType: contract.accountType,
      lifecycle: contract.lifecycle,
      openingBalanceCents: openingBalanceForContract(contract, preparedProduct),
      sourceIdentifier: contract.identifier,
    });
    observations.push(...preparedProduct);
  }

  if (!accounts.length || !observations.length) {
    throw new SourceWorkbookContractError(
      "opening_balance_unavailable",
      "La fuente oficial no contiene productos con movimientos autoritativos utilizables.",
    );
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
