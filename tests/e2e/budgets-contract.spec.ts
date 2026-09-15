import { expect, test } from "@playwright/test";
import { isBudgetSnapshot } from "../../src/application/budgets/budget-contract";

const snapshot = {
  contractVersion: 1,
  month: "2026-09",
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  total: {
    id: null,
    persisted: false,
    categoryId: null,
    categoryName: null,
    categoryLifecycle: null,
    automaticAmountCents: 10000,
    manualAmountCents: null,
    effectiveAmountCents: 10000,
    actualExpenseCents: 5000,
    remainingCents: 5000,
    progressBps: 5000,
    status: "on_track",
    automaticExplanation: "Media de los tres meses completos anteriores.",
    historyMonths: [{ month: "2026-08", expenseCents: 10000 }],
  },
  categories: [],
  principles: {
    bankSource: "read_only",
    actualSource: "financial_transaction_facts",
    recommendation: "trailing_3_complete_month_average",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  },
};

test("budget contract accepts the canonical read-only snapshot", () => {
  expect(isBudgetSnapshot(snapshot)).toBe(true);
});

test("budget contract rejects snapshots that lose financial invariants", () => {
  expect(isBudgetSnapshot({ ...snapshot, contractVersion: 2 })).toBe(false);
  expect(isBudgetSnapshot({ ...snapshot, principles: { ...snapshot.principles, bankSource: "writable" } })).toBe(false);
  expect(isBudgetSnapshot({ ...snapshot, total: { ...snapshot.total, actualExpenseCents: "5000" } })).toBe(false);
  expect(isBudgetSnapshot({ ...snapshot, categories: [{ ...snapshot.total, status: "unknown" }] })).toBe(false);
});
