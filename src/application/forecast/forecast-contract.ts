export type ForecastItem = {
  id: string;
  date: string;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  concept: string;
  amountCents: number;
  origin: "known" | "recurring" | "budget" | "manual" | "inferred";
  confidence: "high" | "medium" | "low";
  recurrenceId: string | null;
  budgetId: string | null;
  confirmedTransactionId: string | null;
  excluded: boolean;
  excludedReason: string;
  reconciliationNote: string;
  projectionKey: string | null;
  updatedAt: string;
  status: "planned" | "excluded" | "confirmed";
  affectsProjection: boolean;
  projectionEffectCents: number;
  projectedBalanceAfterCents: number;
  actual: null | {
    date: string;
    amountCents: number;
    accountId: string;
    categoryId: string | null;
    merchantId: string | null;
    analyticsEligible: boolean;
  };
};

export type ForecastSnapshot = {
  contractVersion: 1;
  period: {
    dateFrom: string;
    dateTo: string;
    accountId: string | null;
  };
  summary: {
    openingBalanceCents: number;
    projectedIncomeCents: number;
    projectedExpenseCents: number;
    projectedNetCents: number;
    projectedClosingBalanceCents: number;
    plannedItems: number;
    excludedItems: number;
    confirmedItems: number;
  };
  items: ForecastItem[];
  budgetContext: Array<{
    month: string;
    budgetCents: number;
    actualExpenseCents: number;
    remainingCents: number;
    status: string;
  }>;
  balanceContext: {
    quality: {
      accounts: number;
      integrityDeltaAccounts: number;
      explicitBalanceAccounts: number;
      reconstructedBalanceAccounts: number;
    };
    accounts: Array<{
      id: string;
      name: string;
      balanceCents: number;
      balanceSource: string;
      explicitBalanceDate: string | null;
      reconstructionDeltaCents: number;
    }>;
  };
  principles: {
    bankSource: string;
    openingBalanceSource: string;
    recurrenceSource: string;
    budgetsCreateDatedItems: boolean;
    excludedItemsAffectCashFlow: boolean;
    confirmedItemsAffectCashFlow: boolean;
    getHasSideEffects: boolean;
  };
};

export type ForecastCandidate = {
  transactionId: string;
  date: string;
  amountCents: number;
  differenceCents: number;
  dayDifference: number;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  concept: string;
};

export type ForecastCandidateSnapshot = {
  forecastItemId: string;
  forecastDate: string;
  forecastAmountCents: number;
  days: number;
  candidates: ForecastCandidate[];
};

export function isForecastSnapshot(value: unknown): value is ForecastSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ForecastSnapshot>;
  // No unsafe cents or wrong-period money may reach server rendering.
  const summary = snapshot.summary;
  const period = snapshot.period;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  return snapshot.contractVersion === 1
    && typeof period?.dateFrom === "string" && datePattern.test(period.dateFrom)
    && typeof period?.dateTo === "string" && datePattern.test(period.dateTo)
    && period.dateFrom <= period.dateTo
    && (period.accountId === null || typeof period.accountId === "string")
    && Boolean(summary)
    && Number.isSafeInteger(summary?.openingBalanceCents)
    && Number.isSafeInteger(summary?.projectedIncomeCents)
    && Number.isSafeInteger(summary?.projectedExpenseCents)
    && Number.isSafeInteger(summary?.projectedNetCents)
    && Number.isSafeInteger(summary?.projectedClosingBalanceCents)
    && Array.isArray(snapshot.items)
    && snapshot.items.every((item) => item && typeof item.id === "string"
      && typeof item.date === "string" && datePattern.test(item.date)
      && Number.isSafeInteger(item.amountCents)
      && Number.isSafeInteger(item.projectionEffectCents)
      && Number.isSafeInteger(item.projectedBalanceAfterCents))
    && Array.isArray(snapshot.budgetContext)
    && snapshot.budgetContext.every((month) => month
      && typeof month.month === "string"
      && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)
      && Number.isSafeInteger(month.budgetCents)
      && Number.isSafeInteger(month.actualExpenseCents)
      && Number.isSafeInteger(month.remainingCents)
      && typeof month.status === "string")
    // ForecastClient reads these two nested objects without optional chaining.
    // A malformed HTTP 200 must not turn a source error into a React crash.
    && Array.isArray(snapshot.balanceContext?.accounts)
    && Boolean(snapshot.balanceContext?.quality)
    && Number.isSafeInteger(snapshot.balanceContext?.quality?.integrityDeltaAccounts)
    && snapshot.balanceContext.accounts.every((account) => account
      && typeof account.id === "string"
      && typeof account.name === "string"
      && Number.isSafeInteger(account.balanceCents)
      && (account.explicitBalanceDate === null || typeof account.explicitBalanceDate === "string"))
    && Number.isSafeInteger(snapshot.summary?.plannedItems)
    && Number.isSafeInteger(snapshot.summary?.excludedItems)
    && Number.isSafeInteger(snapshot.summary?.confirmedItems)
    && snapshot.principles?.bankSource === "read_only"
    && snapshot.principles?.getHasSideEffects === false;
}


/** Refuse a structurally valid response belonging to another period or account. */
export function isForecastSnapshotForSelection(
  value: unknown,
  selection: { dateFrom: string; dateTo: string; accountId: string | null },
): value is ForecastSnapshot {
  return isForecastSnapshot(value)
    && value.period.dateFrom === selection.dateFrom
    && value.period.dateTo === selection.dateTo
    && value.period.accountId === selection.accountId;
}

/** Discard bank reconciliation candidates which do not belong to the requested forecast. */
export function isForecastCandidateSnapshotForRequest(
  value: unknown,
  requested: { itemId: string; days: number; limit: number },
): value is ForecastCandidateSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Partial<ForecastCandidateSnapshot>;
  const validDate = (date: unknown): date is string => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  const uuid = (id: unknown): id is string =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (data.forecastItemId !== requested.itemId
    || !validDate(data.forecastDate)
    || !Number.isSafeInteger(data.forecastAmountCents)
    || data.forecastAmountCents === 0
    || data.days !== requested.days
    || !Array.isArray(data.candidates)
    || data.candidates.length > requested.limit) return false;
  const ids = new Set<string>();
  return data.candidates.every((candidate) => {
    if (!candidate || !uuid(candidate.transactionId)
      || ids.has(candidate.transactionId)
      || !validDate(candidate.date)
      || !uuid(candidate.accountId)
      || !(candidate.categoryId === null || uuid(candidate.categoryId))
      || !(candidate.merchantId === null || uuid(candidate.merchantId))
      || typeof candidate.concept !== "string"
      || !Number.isSafeInteger(candidate.amountCents)
      || candidate.amountCents === 0
      || Math.sign(candidate.amountCents) !== Math.sign(data.forecastAmountCents!)
      || !Number.isSafeInteger(candidate.differenceCents)
      || !Number.isSafeInteger(candidate.dayDifference)
      || candidate.dayDifference < 0
      || candidate.dayDifference > requested.days) return false;
    const actualDays = Math.round(Math.abs(
      Date.parse(candidate.date + "T00:00:00Z") - Date.parse(data.forecastDate + "T00:00:00Z"),
    ) / 86_400_000);
    if (actualDays !== candidate.dayDifference) return false;
    ids.add(candidate.transactionId);
    return true;
  });
}

export function isForecastCandidateSnapshotForItem(
  value: unknown,
  item: Pick<ForecastItem, "id" | "date" | "amountCents">,
  days: number,
  limit: number,
): value is ForecastCandidateSnapshot {
  return isForecastCandidateSnapshotForRequest(value, { itemId: item.id, days, limit })
    && value.forecastDate === item.date
    && value.forecastAmountCents === item.amountCents;
}
