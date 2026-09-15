export type BudgetStatus = "empty" | "unfunded" | "on_track" | "over";

export type BudgetHistoryMonth = {
  month: string;
  expenseCents: number;
};

export type BudgetItem = {
  id: string | null;
  persisted: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryLifecycle: "active" | "archived" | null;
  automaticAmountCents: number;
  manualAmountCents: number | null;
  effectiveAmountCents: number;
  actualExpenseCents: number;
  remainingCents: number;
  progressBps: number | null;
  status: BudgetStatus;
  automaticExplanation: string;
  historyMonths: BudgetHistoryMonth[];
};

export type BudgetSnapshot = {
  contractVersion: 1;
  month: string;
  monthStart: string;
  monthEnd: string;
  total: BudgetItem;
  categories: BudgetItem[];
  principles: {
    bankSource: "read_only";
    actualSource: string;
    recommendation: string;
    transfersConsumeBudget: boolean;
    confirmedDuplicatesConsumeBudget: boolean;
    manualAnalyticsExclusionsRespected: boolean;
    refundsNetAgainstExpense: boolean;
    manualOverrideWins: boolean;
    parentCategoryIncludesDescendants: boolean;
  };
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set<BudgetStatus>(["empty", "unfunded", "on_track", "over"]);

function isSafeCents(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNullableSafeCents(value: unknown) {
  return value === null || isSafeCents(value);
}

function isBudgetItem(value: unknown): value is BudgetItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BudgetItem>;
  return (item.id === null || typeof item.id === "string")
    && typeof item.persisted === "boolean"
    && (item.categoryId === null || typeof item.categoryId === "string")
    && (item.categoryName === null || typeof item.categoryName === "string")
    && (item.categoryLifecycle === null || item.categoryLifecycle === "active" || item.categoryLifecycle === "archived")
    && isSafeCents(item.automaticAmountCents)
    && isNullableSafeCents(item.manualAmountCents)
    && isSafeCents(item.effectiveAmountCents)
    && isSafeCents(item.actualExpenseCents)
    && isSafeCents(item.remainingCents)
    && (item.progressBps === null || (typeof item.progressBps === "number" && Number.isSafeInteger(item.progressBps)))
    && typeof item.status === "string"
    && STATUSES.has(item.status as BudgetStatus)
    && typeof item.automaticExplanation === "string"
    && Array.isArray(item.historyMonths)
    && item.historyMonths.every((row) => Boolean(row)
      && typeof row === "object"
      && MONTH.test(String((row as BudgetHistoryMonth).month ?? ""))
      && isSafeCents((row as BudgetHistoryMonth).expenseCents));
}

export function isBudgetSnapshot(value: unknown): value is BudgetSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<BudgetSnapshot>;
  return snapshot.contractVersion === 1
    && typeof snapshot.month === "string"
    && MONTH.test(snapshot.month)
    && typeof snapshot.monthStart === "string"
    && DATE.test(snapshot.monthStart)
    && typeof snapshot.monthEnd === "string"
    && DATE.test(snapshot.monthEnd)
    && isBudgetItem(snapshot.total)
    && Array.isArray(snapshot.categories)
    && snapshot.categories.every(isBudgetItem)
    && snapshot.principles?.bankSource === "read_only"
    && typeof snapshot.principles.actualSource === "string"
    && typeof snapshot.principles.recommendation === "string"
    && typeof snapshot.principles.transfersConsumeBudget === "boolean"
    && typeof snapshot.principles.confirmedDuplicatesConsumeBudget === "boolean"
    && typeof snapshot.principles.manualAnalyticsExclusionsRespected === "boolean"
    && typeof snapshot.principles.refundsNetAgainstExpense === "boolean"
    && typeof snapshot.principles.manualOverrideWins === "boolean"
    && typeof snapshot.principles.parentCategoryIncludesDescendants === "boolean";
}
