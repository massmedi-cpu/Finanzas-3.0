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
  return snapshot.contractVersion === 1
    && Boolean(snapshot.period?.dateFrom)
    && Boolean(snapshot.period?.dateTo)
    && Array.isArray(snapshot.items)
    && Array.isArray(snapshot.budgetContext)
    && snapshot.principles?.bankSource === "read_only"
    && snapshot.principles?.getHasSideEffects === false;
}
