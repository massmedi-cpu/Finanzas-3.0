/**
 * REC-POST-281–287. Pure, read-only comparison of one authoritative source
 * snapshot against its persisted source records. Does not query a database,
 * write data, import rows, infer balances or expose private source identities.
 *
 * Both complete inputs must be obtained independently. A matching result only
 * certifies the supplied snapshots, never broader account completeness.
 */
export type SourcePostflightRow = Readonly<{
  sourceFileId: string;
  sourceSheetId: string;
  sourceRowKey: string;
  accountExternalKey: string;
  bankDate: string;
  amountCents: number;
  balanceAfterCents: number | null;
}>;

export type SourcePostflightAccount = {
  accountExternalKey: string;
  sourceRows: number;
  persistedRows: number;
  matchingRows: number;
  pendingRows: number;
  orphanRows: number;
  differingRows: number;
};

export type SourcePostflightReport = {
  status: "verified" | "pending" | "blocked";
  scope: "supplied_snapshots_only";
  sourceRows: number;
  persistedRows: number;
  matchingRows: number;
  pendingRows: number;
  orphanRows: number;
  differingRows: number;
  matchingUnknownBalances: number;
  differences: { account: number; bankDate: number; amountCents: number; balanceAfterCents: number };
  accounts: SourcePostflightAccount[];
};

/**
 * The browser-facing contract contains counts and generic account labels only.
 * Source account keys stay on the server: they may encode bank product details.
 */
export type PublicSourcePostflightAccount = Omit<SourcePostflightAccount, "accountExternalKey"> & {
  accountLabel: string;
};
export type PublicSourcePostflightReport = Omit<SourcePostflightReport, "accounts"> & {
  accounts: PublicSourcePostflightAccount[];
};

export function toPublicSourcePostflightReport(report: SourcePostflightReport): PublicSourcePostflightReport {
  const { accounts, ...aggregates } = report;
  return {
    ...aggregates,
    accounts: accounts.map(({ accountExternalKey: _privateKey, ...counts }, index) => ({
      ...counts,
      accountLabel: `Cuenta ${index + 1}`,
    })),
  };
}

export type SourcePostflightErrorCode =
  | "source_postflight_invalid_record"
  | "source_postflight_duplicate_identity"
  | "source_postflight_limit_exceeded";

export class SourcePostflightError extends Error {
  constructor(readonly code: SourcePostflightErrorCode) {
    // No source ID, bank amount, file path or document contents in errors.
    super(code);
    this.name = "SourcePostflightError";
  }
}

const MAX_POSTFLIGHT_ROWS = 10_000;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function identity(row: SourcePostflightRow): string {
  if (!row || typeof row !== "object"
    || typeof row.sourceFileId !== "string" || !row.sourceFileId.trim()
    || typeof row.sourceSheetId !== "string" || !row.sourceSheetId.trim()
    || typeof row.sourceRowKey !== "string" || !row.sourceRowKey.trim()
    || typeof row.accountExternalKey !== "string" || !row.accountExternalKey.trim()
    || !validDate(row.bankDate)
    || !Number.isSafeInteger(row.amountCents)
    || !(row.balanceAfterCents === null || Number.isSafeInteger(row.balanceAfterCents))) {
    throw new SourcePostflightError("source_postflight_invalid_record");
  }
  return JSON.stringify([row.sourceFileId.trim(), row.sourceSheetId.trim(), row.sourceRowKey.trim()]);
}

function indexRows(rows: readonly SourcePostflightRow[]) {
  if (!Array.isArray(rows)) throw new SourcePostflightError("source_postflight_invalid_record");
  if (rows.length > MAX_POSTFLIGHT_ROWS) {
    throw new SourcePostflightError("source_postflight_limit_exceeded");
  }
  const indexed = new Map<string, SourcePostflightRow>();
  for (const row of rows) {
    const key = identity(row);
    if (indexed.has(key)) throw new SourcePostflightError("source_postflight_duplicate_identity");
    indexed.set(key, row);
  }
  return indexed;
}

/** The function never mutates either input and returns aggregate counts only. */
export function reconcileOfficialSourcePostflight(
  source: readonly SourcePostflightRow[],
  persisted: readonly SourcePostflightRow[],
): SourcePostflightReport {
  const official = indexRows(source);
  const stored = indexRows(persisted);
  const groups = new Map<string, SourcePostflightAccount>();
  const accountFor = (key: string) => {
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        accountExternalKey: key, sourceRows: 0, persistedRows: 0,
        matchingRows: 0, pendingRows: 0, orphanRows: 0, differingRows: 0,
      };
      groups.set(key, entry);
    }
    return entry;
  };

  for (const row of official.values()) accountFor(row.accountExternalKey).sourceRows += 1;
  for (const row of stored.values()) accountFor(row.accountExternalKey).persistedRows += 1;

  const differences = { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 0 };
  let matchingRows = 0;
  let matchingUnknownBalances = 0;
  let pendingRows = 0;
  let orphanRows = 0;
  let differingRows = 0;

  for (const [key, row] of official) {
    const group = accountFor(row.accountExternalKey);
    const other = stored.get(key);
    if (!other) {
      pendingRows += 1;
      group.pendingRows += 1;
      continue;
    }
    const a = other.accountExternalKey !== row.accountExternalKey;
    const d = other.bankDate !== row.bankDate;
    const m = other.amountCents !== row.amountCents;
    // null means unknown; never coerce it to zero or treat it as mismatch
    // when both sides faithfully preserve the unknown balance.
    const b = other.balanceAfterCents !== row.balanceAfterCents;
    if (a || d || m || b) {
      if (a) differences.account += 1;
      if (d) differences.bankDate += 1;
      if (m) differences.amountCents += 1;
      if (b) differences.balanceAfterCents += 1;
      differingRows += 1;
      group.differingRows += 1;
    } else {
      matchingRows += 1;
      group.matchingRows += 1;
      if (row.balanceAfterCents === null) matchingUnknownBalances += 1;
    }
  }
  for (const [key, row] of stored) {
    if (!official.has(key)) {
      orphanRows += 1;
      accountFor(row.accountExternalKey).orphanRows += 1;
    }
  }

  return {
    // Never certify an empty pair of snapshots as proof of financial coverage.
    status: official.size === 0 || differingRows || orphanRows ? "blocked" : pendingRows ? "pending" : "verified",
    scope: "supplied_snapshots_only",
    sourceRows: official.size, persistedRows: stored.size,
    matchingRows, pendingRows, orphanRows, differingRows,
    matchingUnknownBalances, differences,
    accounts: [...groups.values()].sort((a, b) =>
      a.accountExternalKey.localeCompare(b.accountExternalKey)),
  };
}


/**
 * REC-POST-295: refuse contradictory aggregates returned by a remote route.
 * In particular, an HTTP 200 cannot call 20 pending movements "verified".
 */
export function isConfirmedSourcePostflightReport(value: unknown): value is PublicSourcePostflightReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Partial<PublicSourcePostflightReport>;
  if (r.scope !== "supplied_snapshots_only" || !["verified", "pending", "blocked"].includes(r.status ?? "")) return false;
  const numeric = [
    r.sourceRows, r.persistedRows, r.matchingRows, r.pendingRows,
    r.orphanRows, r.differingRows, r.matchingUnknownBalances,
  ];
  if (numeric.some(n => !Number.isSafeInteger(n) || (n as number) < 0 || (n as number) > 10000)) return false;
  const sourceRows = r.sourceRows!;
  const persistedRows = r.persistedRows!;
  if (sourceRows === 0 || r.matchingRows! + r.pendingRows! + r.differingRows! !== sourceRows
    || r.matchingRows! + r.differingRows! + r.orphanRows! !== persistedRows
    || r.matchingUnknownBalances! > r.matchingRows!) return false;

  const diff = r.differences;
  if (!diff || typeof diff !== "object") return false;
  if ([diff.account, diff.bankDate, diff.amountCents, diff.balanceAfterCents].some(
    n => !Number.isSafeInteger(n) || n < 0 || n > r.differingRows!,
  )) return false;
  if (r.differingRows! > 0
    && diff.account + diff.bankDate + diff.amountCents + diff.balanceAfterCents < r.differingRows!) return false;
  if (r.differingRows === 0
    && diff.account + diff.bankDate + diff.amountCents + diff.balanceAfterCents !== 0) return false;

  const expectedStatus = r.differingRows! || r.orphanRows! ? "blocked"
    : r.pendingRows! ? "pending" : "verified";
  if (r.status !== expectedStatus) return false;

  if (!Array.isArray(r.accounts) || r.accounts.length < 1 || r.accounts.length > sourceRows + r.orphanRows!) {
    return false;
  }
  const keys = new Set<string>();
  const accountTotals = {
    sourceRows: 0, persistedRows: 0, matchingRows: 0,
    pendingRows: 0, orphanRows: 0, differingRows: 0,
  };
  for (const entry of r.accounts) {
    if (!entry || typeof entry !== "object"
      || typeof entry.accountLabel !== "string"
      || !/^Cuenta [1-9][0-9]*$/.test(entry.accountLabel)
      || entry.accountLabel.length > 20
      || Object.hasOwn(entry, "accountExternalKey")
      || keys.has(entry.accountLabel)) return false;
    keys.add(entry.accountLabel);
    for (const key of Object.keys(accountTotals) as Array<keyof typeof accountTotals>) {
      const n = entry[key];
      if (!Number.isSafeInteger(n) || n < 0 || n > 10000) return false;
      accountTotals[key] += n;
    }
    if (entry.matchingRows + entry.pendingRows + entry.differingRows !== entry.sourceRows) return false;
  }
  return Object.keys(accountTotals).every(
    key => accountTotals[key as keyof typeof accountTotals] === r[key as keyof typeof accountTotals],
  );
}
