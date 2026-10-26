import assert from "node:assert/strict";
import test from "node:test";
import { homeBalancePlotRows, isHomeBalanceSeries } from "../../src/application/dashboard/home-balance-series.ts";

function series() {
  return {
    dateFrom: "2026-07-01", dateTo: "2026-09-16", accountId: null,
    rows: [
      { monthStart: "2026-07-01", asOfDate: "2026-07-31", balanceCents: 0, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
      { monthStart: "2026-08-01", asOfDate: "2026-08-31", balanceCents: -25000, accounts: 1, explicitBalanceAccounts: 0, reconstructedBalanceAccounts: 1 },
      { monthStart: "2026-09-01", asOfDate: "2026-09-16", balanceCents: 105000, accounts: 1, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
    ],
    principles: { bankSource: "read_only", balanceSource: "financial_account_balances", cashFlowReconstruction: false, getHasSideEffects: false },
  };
}

for (const missing of [0, 1, 2]) {
  test(`an omitted month at position ${missing} stays unknown without changing received bank values`, () => {
    const input = series();
    input.rows.splice(missing, 1);
    const original = structuredClone(input);
    input.rows.forEach(Object.freeze);
    Object.freeze(input.rows);
    Object.freeze(input);
    assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), true);
    const result = homeBalancePlotRows(input);
    assert.deepEqual(result.map((row) => row.monthStart), ["2026-07-01", "2026-08-01", "2026-09-01"]);
    assert.equal(result[missing].balanceCents, null);
    assert.equal(result[missing].accounts, 0);
    assert.equal(result.filter((row) => row.accounts > 0).length, 2);
    for (const observed of input.rows) assert.equal(result.find((row) => row.monthStart === observed.monthStart), observed);
    assert.deepEqual(input, original);
  });
}

test("a genuine zero, a negative balance and reconstructed provenance remain unchanged", () => {
  const input = series();
  assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), true);
  const result = homeBalancePlotRows(input);
  assert.deepEqual(result.map((row) => row.balanceCents), [0, -25000, 105000]);
  assert.equal(result[1].reconstructedBalanceAccounts, 1);
  assert.equal(result[0].accounts, 1);
});

test("an empty response produces unavailable months rather than invented zero balances", () => {
  const input = series();
  input.rows = [];
  assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), true);
  const result = homeBalancePlotRows(input);
  assert.equal(result.length, 3);
  assert.ok(result.every((row) => row.balanceCents === null && row.accounts === 0));
});

test("calendar slots cross the year and respect leap February and the requested final day", () => {
  const input = { ...series(), dateFrom: "2023-12-20", dateTo: "2024-03-15", rows: [] };
  const result = homeBalancePlotRows(input);
  assert.deepEqual(result.map((row) => [row.monthStart, row.asOfDate]), [
    ["2023-12-01", "2023-12-31"], ["2024-01-01", "2024-01-31"],
    ["2024-02-01", "2024-02-29"], ["2024-03-01", "2024-03-15"],
  ]);
});

for (const [month, cutoff] of [[0, "2026-07-15"], [1, "2026-08-30"], [2, "2026-09-15"]]) {
  test(`a snapshot cut off at ${cutoff} cannot masquerade as the requested monthly close`, () => {
    const input = series();
    input.rows[month].asOfDate = cutoff;
    assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), false);
  });
}

test("leap February requires its real closing day", () => {
  const input = { ...series(), dateFrom: "2024-02-01", dateTo: "2024-02-29", rows: [
    { ...series().rows[0], monthStart: "2024-02-01", asOfDate: "2024-02-29" },
  ] };
  assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), true);
  input.rows[0].asOfDate = "2024-02-28";
  assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), false);
});

test("the contract still rejects wrong scope, duplicate months, unsafe money and contradictory quality", () => {
  const invalid = [];
  const scoped = series(); scoped.accountId = "another-account"; invalid.push(scoped);
  const repeated = series(); repeated.rows.push({ ...repeated.rows[2] }); invalid.push(repeated);
  const fractional = series(); fractional.rows[0].balanceCents = 0.5; invalid.push(fractional);
  const unsafe = series(); unsafe.rows[0].balanceCents = Number.MAX_SAFE_INTEGER + 1; invalid.push(unsafe);
  const quality = series(); quality.rows[0].explicitBalanceAccounts = 2; invalid.push(quality);
  const nullRow = series(); nullRow.rows[0] = null; invalid.push(nullRow);
  for (const input of invalid) assert.equal(isHomeBalanceSeries(input, input.dateFrom, input.dateTo), false);
  assert.equal(isHomeBalanceSeries(series(), "2026-07-32", "2026-09-16"), false);
});
