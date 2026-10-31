export type HomeBalanceRow = {
  monthStart: string;
  asOfDate: string;
  balanceCents: number;
  accounts: number;
  explicitBalanceAccounts: number;
  reconstructedBalanceAccounts: number;
};

export type HomeBalancePlotRow = Omit<HomeBalanceRow, "balanceCents"> & {
  balanceCents: number | null;
};

export type HomeBalanceSeries = {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
  rows: HomeBalanceRow[];
  principles: {
    bankSource: "read_only";
    balanceSource: "financial_account_balances";
    cashFlowReconstruction: false;
    getHasSideEffects: false;
  };
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function snapshotDate(monthStart: string, dateTo: string) {
  const monthEnd = new Date(`${monthStart}T12:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const end = monthEnd.toISOString().slice(0, 10);
  return end < dateTo ? end : dateTo;
}

export function isHomeBalanceSeries(value: unknown, dateFrom: string, dateTo: string): value is HomeBalanceSeries {
  if (!isCalendarDate(dateFrom) || !isCalendarDate(dateTo) || dateFrom > dateTo
    || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<HomeBalanceSeries>;
  const principles = candidate.principles;
  const months = new Set<string>();
  return candidate.dateFrom === dateFrom && candidate.dateTo === dateTo
    && candidate.accountId === null
    && Array.isArray(candidate.rows)
    && principles?.bankSource === "read_only"
    && principles?.balanceSource === "financial_account_balances"
    && principles?.cashFlowReconstruction === false
    && principles?.getHasSideEffects === false
    && candidate.rows.every((row, index, rows) => {
      if (!row || typeof row !== "object"
        || !isCalendarDate(row.monthStart) || !row.monthStart.endsWith("-01")
        || !isCalendarDate(row.asOfDate)
        || row.monthStart < `${dateFrom.slice(0, 7)}-01` || row.monthStart > dateTo
        // A mid-month snapshot cannot be labelled as that month's closing balance.
        || row.asOfDate !== snapshotDate(row.monthStart, dateTo)
        || months.has(row.monthStart)
        || (index > 0 && rows[index - 1].monthStart >= row.monthStart)
        || !Number.isSafeInteger(row.balanceCents)
        || !Number.isSafeInteger(row.accounts) || row.accounts < 0
        || !Number.isSafeInteger(row.explicitBalanceAccounts) || row.explicitBalanceAccounts < 0
        || !Number.isSafeInteger(row.reconstructedBalanceAccounts) || row.reconstructedBalanceAccounts < 0
        || row.explicitBalanceAccounts + row.reconstructedBalanceAccounts !== row.accounts) return false;
      months.add(row.monthStart);
      return true;
    });
}

/**
 * Preserve every received observation and expose every unreturned month.
 * Missing points are display-only nulls, never invented zero bank balances
 * or interpolated values. The source response is never modified.
 */
export function homeBalancePlotRows(series: HomeBalanceSeries): HomeBalancePlotRow[] {
  const first = Number(series.dateFrom.slice(0, 4)) * 12 + Number(series.dateFrom.slice(5, 7)) - 1;
  const last = Number(series.dateTo.slice(0, 4)) * 12 + Number(series.dateTo.slice(5, 7)) - 1;
  const received = new Map(series.rows.map((row) => [row.monthStart, row]));
  const result: HomeBalancePlotRow[] = [];
  for (let month = first; month <= last; month += 1) {
    const monthStart = `${String(Math.floor(month / 12)).padStart(4, "0")}-${String(month % 12 + 1).padStart(2, "0")}-01`;
    result.push(received.get(monthStart) ?? {
      monthStart,
      asOfDate: snapshotDate(monthStart, series.dateTo),
      balanceCents: null,
      accounts: 0,
      explicitBalanceAccounts: 0,
      reconstructedBalanceAccounts: 0,
    });
  }
  return result;
}
