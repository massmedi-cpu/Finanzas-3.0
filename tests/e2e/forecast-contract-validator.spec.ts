import { expect, test } from "@playwright/test";
import {
  isForecastSnapshot,
  isForecastSnapshotForSelection,
} from "../../src/application/forecast/forecast-contract";

const selection = { dateFrom: "2026-10-01", dateTo: "2026-10-31", accountId: null };

function itemFixture() {
  return {
    id: "81000000-0000-4000-8000-000000000001", date: "2026-10-09", accountId: null,
    accountName: null, categoryId: null, categoryName: null, merchantId: null, merchantName: null,
    concept: "Cobro previsto", amountCents: 500, origin: "manual", confidence: "high",
    recurrenceId: null, budgetId: null, confirmedTransactionId: null, excluded: false,
    excludedReason: "", reconciliationNote: "", projectionKey: null,
    updatedAt: "2026-10-01T10:00:00Z", status: "planned", affectsProjection: true,
    projectionEffectCents: 500, projectedBalanceAfterCents: 10500, actual: null,
  };
}

function fixture() {
  return {
    contractVersion: 1,
    period: { ...selection },
    summary: {
      openingBalanceCents: 10000,
      projectedIncomeCents: 2000,
      projectedExpenseCents: 500,
      projectedNetCents: 1500,
      projectedClosingBalanceCents: 11500,
      plannedItems: 0,
      excludedItems: 0,
      confirmedItems: 0,
    },
    items: [],
    budgetContext: [],
    balanceContext: {
      quality: { accounts: 1, integrityDeltaAccounts: 0, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
      accounts: [],
    },
    principles: {
      bankSource: "read_only",
      getHasSideEffects: false,
    },
  };
}

test("REC-FCAST-038 · correct synthetic snapshot matches selected account and dates", () => {
  expect(isForecastSnapshotForSelection(fixture(), selection)).toBe(true);
});

test("REC-FCAST-039 · refuse valid-looking totals for another banking account or month", () => {
  expect(isForecastSnapshotForSelection({ ...fixture(), period: { ...selection, dateFrom: "2026-09-01" } }, selection)).toBe(false);
  expect(isForecastSnapshotForSelection({ ...fixture(), period: { ...selection, accountId: "10000000-0000-4000-8000-000000000073" } }, selection)).toBe(false);
});

test("REC-FCAST-040 · reject malformed financial amounts instead of presenting them as certain", () => {
  const base = fixture();
  expect(isForecastSnapshot({ ...base, summary: { ...base.summary, projectedClosingBalanceCents: Number.MAX_SAFE_INTEGER + 1 } })).toBe(false);
  expect(isForecastSnapshot({ ...base, summary: null })).toBe(false);
  expect(isForecastSnapshot({ ...base, items: [{ id: "an-item", date: "2026-10-09", amountCents: 1.5, projectionEffectCents: 1.5, projectedBalanceAfterCents: 10000 }] })).toBe(false);
  expect(isForecastSnapshot({ ...base, items: [itemFixture()] })).toBe(true);
});

test("REC-FCAST-060 · corrupt item labels and financial states cannot reach React or the editor", () => {
  const base = { ...fixture(), items: [itemFixture()] };
  expect(isForecastSnapshot(base)).toBe(true);
  for (const [field, bad] of [
    ["concept", {}], ["concept", " "], ["categoryName", 23], ["accountName", {}],
    ["merchantName", []], ["excludedReason", {}], ["origin", "untrusted"],
    ["confidence", "certain"], ["status", "unknown"], ["excluded", "false"],
    ["affectsProjection", "true"], ["updatedAt", "not-a-date"],
  ] as const) {
    expect(isForecastSnapshot({ ...base, items: [{ ...itemFixture(), [field]: bad }] }), field).toBe(false);
  }
});

test("REC-FCAST-061 · impossible period, balance date and reconciled bank details are rejected", () => {
  const base = fixture();
  expect(isForecastSnapshot({ ...base, period: { ...selection, dateTo: "2026-10-32" } })).toBe(false);
  const actual = {
    date: "2026-10-09", amountCents: 500, accountId: "10000000-0000-4000-8000-000000000001",
    categoryId: null, merchantId: null, analyticsEligible: true,
  };
  expect(isForecastSnapshot({ ...base, items: [{ ...itemFixture(), actual }] })).toBe(true);
  for (const patch of [{ date: "2026-02-30" }, { amountCents: 0.5 }, { analyticsEligible: "false" }]) {
    expect(isForecastSnapshot({ ...base, items: [{ ...itemFixture(), actual: { ...actual, ...patch } }] })).toBe(false);
  }
  expect(isForecastSnapshot({ ...base, balanceContext: { ...base.balanceContext, accounts: [
    { id: "account", name: "Cuenta", balanceCents: 10000, explicitBalanceDate: "2026-02-30" },
  ] } })).toBe(false);
});


test("REC-FCAST-048 · reject a missing or broken balance structure instead of crashing forecast UI", () => {
  const valid = fixture();
  expect(isForecastSnapshot(valid)).toBe(true);
  expect(isForecastSnapshot({ ...valid, balanceContext: null })).toBe(false);
  expect(isForecastSnapshot({ ...valid, balanceContext: { accounts: [] } })).toBe(false);
  expect(isForecastSnapshot({
    ...valid,
    balanceContext: { quality: { integrityDeltaAccounts: NaN }, accounts: [] },
  })).toBe(false);
});

test("REC-FCAST-049 · reject budget context with unsafe cents or an impossible month", () => {
  const valid = fixture();
  expect(isForecastSnapshot({
    ...valid,
    budgetContext: [{ month: "2026-10", budgetCents: 10000, actualExpenseCents: 5000, remainingCents: 5000, status: "on_track" }],
  })).toBe(true);
  expect(isForecastSnapshot({
    ...valid,
    budgetContext: [{ month: "2026-13", budgetCents: 10000, actualExpenseCents: 5000, remainingCents: 5000, status: "on_track" }],
  })).toBe(false);
  expect(isForecastSnapshot({
    ...valid,
    budgetContext: [{ month: "2026-10", budgetCents: Number.MAX_SAFE_INTEGER + 1, actualExpenseCents: 0, remainingCents: 0, status: "on_track" }],
  })).toBe(false);
});
