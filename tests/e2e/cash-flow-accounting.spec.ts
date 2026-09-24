import { expect, test } from "@playwright/test";
import {
  assembleCashFlow,
  cashFlowMonth,
  type CashFlowTransaction,
} from "../../src/application/cash-flow/cash-flow-model";
import type { ForecastItem, ForecastSnapshot } from "../../src/application/forecast/forecast-contract";

function transaction(id: string, bankDate: string, amountCents: number,
  kind: CashFlowTransaction["kind"]["effective"], options: Partial<CashFlowTransaction> = {}): CashFlowTransaction {
  return {
    id, bankDate, amountCents, account: { id: "account-a", name: "Cuenta principal" },
    concept: { effective: id }, kind: { effective: kind }, duplicateState: "none", excludedFromAnalytics: false,
    ...options,
  };
}

function forecast(id: string, date: string, amountCents: number, projectionEffectCents: number,
  status: ForecastItem["status"], actual: ForecastItem["actual"] = null): ForecastItem {
  return {
    id, date, amountCents, projectionEffectCents, status, actual, concept: id,
    accountId: null, accountName: null, categoryId: null, categoryName: null,
    merchantId: null, merchantName: null, origin: "manual", confidence: "high",
    recurrenceId: null, budgetId: null, confirmedTransactionId: actual ? "bank-matched" : null,
    excluded: status === "excluded", excludedReason: "", reconciliationNote: "", projectionKey: null,
    updatedAt: "2026-09-10T10:00:00Z", affectsProjection: projectionEffectCents !== 0,
    projectedBalanceAfterCents: 0,
  };
}

const actualRows = [
  transaction("salary", "2026-09-10", 10_000, "income"),
  transaction("rent", "2026-09-10", -3_000, "expense"),
  transaction("refund", "2026-09-10", 500, "refund"),
  transaction("adjustment", "2026-09-10", -100, "adjustment"),
  transaction("bank-matched", "2026-09-12", -3_000, "expense"),
  transaction("transfer", "2026-09-10", -2_000, "transfer"),
  transaction("duplicate", "2026-09-10", -800, "expense", { duplicateState: "confirmed" }),
  transaction("excluded", "2026-09-10", 900, "income", { excludedFromAnalytics: true }),
];

const forecastItems = [
  forecast("expected-income", "2026-09-11", 2_000, 2_000, "planned"),
  forecast("expected-expense", "2026-09-11", -1_200, -1_200, "planned"),
  forecast("matched-expense", "2026-09-11", -3_000, 0, "confirmed", {
    date: "2026-09-12", amountCents: -3_000, accountId: "account-a",
    categoryId: null, merchantId: null, analyticsEligible: true,
  }),
  forecast("discarded", "2026-09-11", 400, 0, "excluded"),
];

const forecastSnapshot: ForecastSnapshot = {
  contractVersion: 1, period: { dateFrom: "2026-09-01", dateTo: "2026-09-30", accountId: null },
  summary: {
    openingBalanceCents: 0, projectedIncomeCents: 2_000, projectedExpenseCents: 1_200,
    projectedNetCents: 800, projectedClosingBalanceCents: 800,
    plannedItems: 2, excludedItems: 1, confirmedItems: 1,
  },
  items: forecastItems, budgetContext: [],
  balanceContext: { quality: { accounts: 0, integrityDeltaAccounts: 0, explicitBalanceAccounts: 0, reconstructedBalanceAccounts: 0 }, accounts: [] },
  principles: { bankSource: "read_only", openingBalanceSource: "financial_account_balances", recurrenceSource: "recurring", budgetsCreateDatedItems: false, excludedItemsAffectCashFlow: false, confirmedItemsAffectCashFlow: false, getHasSideEffects: false },
};

function view(options: { net?: number; rows?: CashFlowTransaction[] | null;
  state?: "complete" | "incomplete" | "unavailable"; forecast?: unknown } = {}) {
  return assembleCashFlow({
    month: "2026-09", dateFrom: "2026-09-01", dateTo: "2026-09-30",
    period: { dateFrom: "2026-09-01", dateTo: "2026-09-30", accountId: null, operatingNetCents: options.net ?? 4_400, quality: { scopedRows: 8, includedRows: 6 } },
    transactions: options.rows === undefined ? actualRows : options.rows,
    transactionState: options.state ?? "complete",
    forecast: options.forecast === undefined ? forecastSnapshot : options.forecast,
  });
}

test("Cash Flow reconcilia hechos reales y previsiones sin duplicar el cargo ya realizado", () => {
  const result = view();
  expect(result.actualState).toBe("ready");
  expect(result.forecastState).toBe("ready");
  expect(result.actualNetCents).toBe(4_400);
  expect(result.plannedNetCents).toBe(800);
  const expectedDay = result.days.find((day) => day.date === "2026-09-11")!;
  const actualDay = result.days.find((day) => day.date === "2026-09-12")!;
  expect(expectedDay.plannedNetCents).toBe(800);
  expect(expectedDay.realNetCents).toBe(0);
  expect(actualDay.plannedNetCents).toBe(0);
  expect(actualDay.realNetCents).toBe(-3_000);
  expect(expectedDay.forecasts.find((item) => item.id === "matched-expense")?.actual?.date).toBe("2026-09-12");
});

test("Cash Flow no publica importes reales si la paginación está incompleta o falla la conciliación", () => {
  expect(view({ rows: null, state: "incomplete" }).actualNetCents).toBeNull();
  const mismatch = view({ net: 4_401 });
  expect(mismatch.actualState).toBe("mismatch");
  expect(mismatch.actualNetCents).toBeNull();
  expect(mismatch.days.find((day) => day.date === "2026-09-10")?.realNetCents).toBe(0);
  expect(mismatch.plannedNetCents).toBe(800);
  expect(view({ forecast: { ...forecastSnapshot, period: { ...forecastSnapshot.period, accountId: "other-account" } } }).forecastState).toBe("unavailable");
});

test("Cash Flow tampoco publica un neto previsto si los ítems discrepan del motor", () => {
  const mismatch = view({ forecast: {
    ...forecastSnapshot, summary: { ...forecastSnapshot.summary, projectedNetCents: 801 },
  } });
  expect(mismatch.forecastState).toBe("mismatch");
  expect(mismatch.plannedNetCents).toBeNull();
  expect(mismatch.actualNetCents).toBe(4_400);
  const incomeMismatch = view({ forecast: {
    ...forecastSnapshot, summary: { ...forecastSnapshot.summary, projectedIncomeCents: 2_001 },
  } });
  expect(incomeMismatch.forecastState).toBe("mismatch");
  expect(incomeMismatch.plannedNetCents).toBeNull();
});

test("Cash Flow valida meses y febrero bisiesto sin adelantar la fecha bancaria", () => {
  expect(cashFlowMonth("2028-02", "2026-09-24").dateTo).toBe("2028-02-29");
  expect(cashFlowMonth("2026-13", "2026-09-24")).toMatchObject({ month: "2026-09", invalid: true });
});
