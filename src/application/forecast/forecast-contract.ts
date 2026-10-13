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
