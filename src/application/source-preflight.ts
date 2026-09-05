import {
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
  type PreparedSourceObservation,
} from "./source-sync-service";

export type OfficialSourcePreflightAccount = {
  accountExternalKey: string;
  accountName: string;
  accountType: string;
  lifecycle: string;
  authoritativeRows: number;
  openingBalanceCents: number;
  newestBankDate: string | null;
  oldestBankDate: string | null;
  latestBalanceAfterCents: number | null;
};

export type OfficialSourcePreflightCursor = {
  sourceSheetId: string;
  sheetTitle: string;
  authoritativeRows: number;
  lastSourceRowKey: string;
};

export type OfficialSourcePreflightSummary = {
  sourceFileId: string;
  sourceRevision: string | null;
  schemaFingerprint: string;
  totalAuthoritativeRows: number;
  accounts: OfficialSourcePreflightAccount[];
  cursors: OfficialSourcePreflightCursor[];
};

export type OfficialSourceHistoricalBaselineErrorCode =
  | "historical_total_rows_regressed"
  | "historical_account_missing"
  | "historical_account_contract_changed"
  | "historical_account_rows_regressed"
  | "historical_opening_balance_changed"
  | "historical_sheet_cursor_missing"
  | "historical_sheet_rows_regressed"
  | "historical_oldest_row_changed";

export class OfficialSourceHistoricalBaselineError extends Error {
  constructor(
    public readonly code: OfficialSourceHistoricalBaselineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OfficialSourceHistoricalBaselineError";
  }
}

/**
 * Baseline comprobado directamente contra “Movimientos bancarios - fuente” el 04/09/2026.
 * Son mínimos históricos, no recuentos máximos: los movimientos nuevos deben poder crecer
 * por la parte reciente sin permitir que desaparezca o se reescriba el histórico validado.
 */
export const OFFICIAL_SOURCE_HISTORICAL_BASELINE = {
  minimumTotalAuthoritativeRows: 3172,
  accounts: [
    {
      accountName: "Cuenta corriente Openbank · 3967",
      accountType: "checking",
      lifecycle: "active",
      minimumAuthoritativeRows: 3024,
      openingBalanceCents: 0,
    },
    {
      accountName: "Cuenta ahorro Openbank · 2504",
      accountType: "savings",
      lifecycle: "active",
      minimumAuthoritativeRows: 15,
      openingBalanceCents: 0,
    },
    {
      accountName: "Tarjeta prepago Openbank · 8403",
      accountType: "other",
      lifecycle: "archived",
      minimumAuthoritativeRows: 133,
      openingBalanceCents: 0,
    },
  ],
  cursors: [
    {
      sheetTitle: "Cuenta corriente · 3967",
      minimumAuthoritativeRows: 3157,
      oldestSourceRowKey: "CC-02963",
    },
    {
      sheetTitle: "Cuenta ahorro · 2504",
      minimumAuthoritativeRows: 15,
      oldestSourceRowKey: "AH-00010",
    },
  ],
} as const;

function observationsByAccount(observations: readonly PreparedSourceObservation[]) {
  const grouped = new Map<string, PreparedSourceObservation[]>();
  for (const observation of observations) {
    const rows = grouped.get(observation.accountExternalKey) ?? [];
    rows.push(observation);
    grouped.set(observation.accountExternalKey, rows);
  }
  return grouped;
}

export function buildOfficialSourcePreflightSummary(
  snapshot: OfficialSourceWorkbookSnapshot,
): OfficialSourcePreflightSummary {
  const batch = prepareOfficialSourceSyncBatch(snapshot);
  const grouped = observationsByAccount(batch.observations);
  const sheetTitles = new Map(snapshot.sheets.map((sheet) => [sheet.sourceSheetId, sheet.title]));
  const cursors = new Map<string, OfficialSourcePreflightCursor>();

  for (const observation of batch.observations) {
    const current = cursors.get(observation.sourceSheetId);
    cursors.set(observation.sourceSheetId, {
      sourceSheetId: observation.sourceSheetId,
      sheetTitle: sheetTitles.get(observation.sourceSheetId) ?? observation.sourceSheetId,
      authoritativeRows: (current?.authoritativeRows ?? 0) + 1,
      lastSourceRowKey: observation.sourceRowKey,
    });
  }

  return {
    sourceFileId: batch.sourceFileId,
    sourceRevision: batch.sourceRevision,
    schemaFingerprint: batch.schemaFingerprint,
    totalAuthoritativeRows: batch.observations.length,
    accounts: batch.accounts.map((account) => {
      const observations = grouped.get(account.accountExternalKey) ?? [];
      return {
        accountExternalKey: account.accountExternalKey,
        accountName: account.accountName,
        accountType: account.accountType,
        lifecycle: account.lifecycle,
        authoritativeRows: observations.length,
        openingBalanceCents: account.openingBalanceCents,
        newestBankDate: observations[0]?.bankDate ?? null,
        oldestBankDate: observations.at(-1)?.bankDate ?? null,
        latestBalanceAfterCents: observations[0]?.balanceAfterCents ?? null,
      };
    }),
    cursors: [...cursors.values()],
  };
}

export function assertOfficialSourceHistoricalBaseline(
  summary: OfficialSourcePreflightSummary,
) {
  const baseline = OFFICIAL_SOURCE_HISTORICAL_BASELINE;

  if (summary.totalAuthoritativeRows < baseline.minimumTotalAuthoritativeRows) {
    throw new OfficialSourceHistoricalBaselineError(
      "historical_total_rows_regressed",
      `La fuente contiene ${summary.totalAuthoritativeRows} movimientos autoritativos y el histórico validado exige al menos ${baseline.minimumTotalAuthoritativeRows}.`,
    );
  }

  for (const expected of baseline.accounts) {
    const account = summary.accounts.find((candidate) => candidate.accountName === expected.accountName);
    if (!account) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_account_missing",
        `Ha desaparecido del origen el producto histórico “${expected.accountName}”.`,
      );
    }

    if (account.accountType !== expected.accountType || account.lifecycle !== expected.lifecycle) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_account_contract_changed",
        `El contrato histórico de “${expected.accountName}” ha cambiado de tipo o ciclo de vida.`,
      );
    }

    if (account.authoritativeRows < expected.minimumAuthoritativeRows) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_account_rows_regressed",
        `“${expected.accountName}” contiene ${account.authoritativeRows} movimientos y el histórico validado exige al menos ${expected.minimumAuthoritativeRows}.`,
      );
    }

    if (account.openingBalanceCents !== expected.openingBalanceCents) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_opening_balance_changed",
        `El saldo inicial derivado de “${expected.accountName}” ya no coincide con el histórico validado.`,
      );
    }
  }

  for (const expected of baseline.cursors) {
    const cursor = summary.cursors.find((candidate) => candidate.sheetTitle === expected.sheetTitle);
    if (!cursor) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_sheet_cursor_missing",
        `No se puede verificar la pestaña histórica “${expected.sheetTitle}”.`,
      );
    }

    if (cursor.authoritativeRows < expected.minimumAuthoritativeRows) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_sheet_rows_regressed",
        `La pestaña “${expected.sheetTitle}” contiene ${cursor.authoritativeRows} filas autoritativas y el histórico validado exige al menos ${expected.minimumAuthoritativeRows}.`,
      );
    }

    if (cursor.lastSourceRowKey !== expected.oldestSourceRowKey) {
      throw new OfficialSourceHistoricalBaselineError(
        "historical_oldest_row_changed",
        `La fila histórica más antigua de “${expected.sheetTitle}” ya no es “${expected.oldestSourceRowKey}”.`,
      );
    }
  }

  return summary;
}
