import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { GET as getComparison } from "../../app/api/compare/route";
import type { AnalysisGatewaySnapshot } from "../../src/application/analysis/analysis-engine";
import { buildAnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import { isComparisonSnapshot } from "../../src/application/comparison/comparison-contract";
import { buildComparisonSnapshot } from "../../src/application/comparison/comparison-engine";
import { loadComparisonSnapshot } from "../../src/application/comparison/comparison-loader";
import { comparisonSelectionFromSearchParams } from "../../src/application/comparison/comparison-query-state";
import {
  MAX_COMPARISON_DAYS,
  resolveComparisonSelection,
} from "../../src/application/comparison/comparison-selection";
import { comparisonModuleLinks } from "../../src/application/navigation/module-context";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000002";
const MERCHANT_ID = "30000000-0000-4000-8000-000000000003";

function gatewayFixture(input: {
  primaryFrom?: string;
  primaryTo?: string;
  referenceFrom?: string;
  referenceTo?: string;
} = {}): AnalysisGatewaySnapshot {
  const primaryFrom = input.primaryFrom ?? "2026-09-01";
  const primaryTo = input.primaryTo ?? "2026-09-10";
  const referenceFrom = input.referenceFrom ?? "2026-08-01";
  const referenceTo = input.referenceTo ?? "2026-08-05";
  return {
    current: {
      dateFrom: primaryFrom,
      dateTo: primaryTo,
      incomeCents: 50_000,
      expenseCents: 20_000,
      operatingNetCents: 30_000,
      savingsCents: 30_000,
      savingsRateBps: 6_000,
      quality: {
        scopedRows: 5,
        includedRows: 4,
        manuallyExcludedRows: 1,
        confirmedDuplicateRows: 0,
        suspectedDuplicateRows: 0,
        signMismatchRows: 0,
      },
    },
    previous: {
      dateFrom: referenceFrom,
      dateTo: referenceTo,
      incomeCents: 45_000,
      expenseCents: 15_000,
      operatingNetCents: 30_000,
      savingsCents: 30_000,
      savingsRateBps: 6_667,
      quality: {
        scopedRows: 4,
        includedRows: 3,
        manuallyExcludedRows: 1,
        confirmedDuplicateRows: 0,
        suspectedDuplicateRows: 0,
        signMismatchRows: 0,
      },
    },
    history: { rows: [] },
    accounts: [{ id: ACCOUNT_ID, name: "Cuenta principal", lifecycle: "active" }],
    categories: [
      {
        id: CATEGORY_ID,
        name: "Alimentación",
        currentExpenseCents: 12_000,
        previousExpenseCents: 9_000,
        currentRows: 3,
        previousRows: 2,
      },
      {
        id: null,
        name: "Sin categoría",
        currentExpenseCents: 8_000,
        previousExpenseCents: 6_000,
        currentRows: 1,
        previousRows: 1,
      },
    ],
    merchants: [
      {
        id: MERCHANT_ID,
        name: "Mercado Central",
        currentExpenseCents: 20_000,
        previousExpenseCents: 15_000,
        currentRows: 4,
        previousRows: 3,
        currentAverageCents: 5_000,
        habitualAverageCents: 4_500,
        historyRows: 8,
      },
    ],
    concentration: { top3CategoryBps: 10_000, top3MerchantBps: 10_000 },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: 20_000,
    },
    budget: null,
    forecast: null,
  };
}

function comparisonFixture() {
  const selection = resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
    accountId: ACCOUNT_ID,
  }, "2026-09-25");
  return buildComparisonSnapshot({ selection, gateway: gatewayFixture() });
}

function expectFiniteNumbers(value: unknown, path = "root") {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} debe ser finito`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      expectFiniteNumbers(item, `${path}.${key}`);
    }
  }
}

test("CMP-001 resuelve por defecto mes actual frente al mismo tramo del mes anterior", () => {
  expect(resolveComparisonSelection({}, "2026-09-25")).toMatchObject({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-25",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-25",
    primaryDays: 25,
    referenceDays: 25,
    budgetMonth: "2026-09",
  });

  expect(resolveComparisonSelection({}, "2024-03-31")).toMatchObject({
    referenceFrom: "2024-02-01",
    referenceTo: "2024-02-29",
    referenceDays: 29,
  });
});

test("CMP-002 rechaza fechas parciales, imposibles, futuras, solapadas o superiores al límite", () => {
  expect(MAX_COMPARISON_DAYS).toBe(366);
  expect(() => resolveComparisonSelection({ primaryFrom: "2026-09-01" }, "2026-09-25"))
    .toThrow("invalid_comparison_periods");
  expect(() => resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-31",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-31",
  }, "2026-09-30")).toThrow("invalid_comparison_date");
  expect(() => resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-30",
    referenceFrom: "2026-08-20",
    referenceTo: "2026-09-01",
  }, "2026-09-30")).toThrow("invalid_comparison_overlap");
  expect(() => resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-26",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-25",
  }, "2026-09-25")).toThrow("invalid_comparison_future_date");
  expect(() => resolveComparisonSelection({
    primaryFrom: "2025-01-01",
    primaryTo: "2026-01-02",
    referenceFrom: "2024-01-01",
    referenceTo: "2024-12-31",
  }, "2026-09-25")).toThrow("comparison_period_too_large");
});

test("CMP-003 conserva total y ritmo diario por separado cuando las duraciones difieren", () => {
  const snapshot = comparisonFixture();
  expect(snapshot.contractVersion).toBe(1);
  expect(snapshot.metrics.expense).toMatchObject({
    primaryCents: 20_000,
    referenceCents: 15_000,
    deltaCents: 5_000,
    primaryDailyCents: 2_000,
    referenceDailyCents: 3_000,
    dailyDeltaCents: -1_000,
  });
  expect(snapshot.savingsRate.deltaBps).toBe(-667);
  expect(snapshot.principles.generativeAi).toBe(false);
  expect(isComparisonSnapshot(snapshot)).toBe(true);
});

test("CMP-004 reconcilia categorías en los dos periodos y falla cerrado si uno diverge", () => {
  const snapshot = comparisonFixture();
  expect(snapshot.quality).toMatchObject({
    reconciled: true,
    primaryCategoryExpenseCents: 20_000,
    referenceCategoryExpenseCents: 15_000,
    primaryIncludedRows: 4,
    referenceIncludedRows: 3,
  });

  const gateway = gatewayFixture();
  gateway.categories[0].previousExpenseCents += 1;
  const selection = resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
  }, "2026-09-25");
  expect(() => buildComparisonSnapshot({ selection, gateway })).toThrow("comparison_reconciliation_failed");
});

test("CMP-005 crea trazabilidad por ambos lados y representa sin categoría con el parámetro público", () => {
  const snapshot = comparisonFixture();
  const food = snapshot.categoryDrivers.find((item) => item.id === CATEGORY_ID);
  const uncategorized = snapshot.categoryDrivers.find((item) => item.id === null);
  expect(food?.primaryHref).toContain(`categoryId=${CATEGORY_ID}`);
  expect(food?.referenceHref).toContain("dateFrom=2026-08-01");
  expect(uncategorized?.primaryHref).toContain("uncategorized=true");
  expect(uncategorized?.primaryHref).not.toContain("__uncategorized__");
  expect(snapshot.merchantDrivers[0].primaryHref).toContain(`merchantId=${MERCHANT_ID}`);
  expect(snapshot.links.primaryTransactions).toContain(`accountId=${ACCOUNT_ID}`);

  const analysisGateway = gatewayFixture();
  const analysis = buildAnalysisSnapshot({
    range: "1m",
    month: "2026-09",
    accountId: ACCOUNT_ID,
    dateFrom: "2026-09-01",
    dateTo: "2026-09-10",
    previousDateFrom: "2026-08-01",
    previousDateTo: "2026-08-05",
    partial: true,
    partialMonthStart: "2026-09-01",
    gateway: analysisGateway,
  });
  expect(analysis.categoryDrivers.find((item) => item.id === null)?.href).toContain("uncategorized=true");
  expect(analysis.categoryDrivers.find((item) => item.id === null)?.href).not.toContain("__uncategorized__");
});

test("CMP-006 el loader hace una sola operación financiera y conserva todos los filtros", async () => {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const snapshot = await loadComparisonSnapshot({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
    accountId: ACCOUNT_ID,
  }, async (action, payload) => {
    calls.push({ action, payload });
    return gatewayFixture();
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    action: "financial.snapshot",
    payload: {
      analysis: true,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-10",
      previousDateFrom: "2026-08-01",
      previousDateTo: "2026-08-05",
      accountId: ACCOUNT_ID,
    },
  });
  expect(isComparisonSnapshot(snapshot)).toBe(true);
});

test("CMP-007 el contrato rechaza números no finitos y selecciones manipuladas", () => {
  const snapshot = comparisonFixture();
  const invalidNumber = structuredClone(snapshot) as unknown as Record<string, any>;
  invalidNumber.metrics.expense.deltaCents = Number.NaN;
  expect(isComparisonSnapshot(invalidNumber)).toBe(false);

  const invalidSelection = structuredClone(snapshot) as unknown as Record<string, any>;
  invalidSelection.selection.referenceTo = "2026-09-01";
  expect(isComparisonSnapshot(invalidSelection)).toBe(false);
});

test("CMP-008 integra URL, navegación contextual, búsqueda y estados responsive/accesibles", () => {
  expect(comparisonSelectionFromSearchParams({
    primaryFrom: ["2026-09-01", "2020-01-01"],
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
    accountId: ACCOUNT_ID,
  })).toEqual({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
    accountId: ACCOUNT_ID,
  });

  const links = comparisonModuleLinks(comparisonFixture().selection);
  expect(links.find((item) => item.label === "Movimientos · principal")?.href).toContain("dateFrom=2026-09-01");
  expect(links.find((item) => item.label === "Movimientos · referencia")?.href).toContain("dateFrom=2026-08-01");

  const navigation = readFileSync("app/navigation-items.ts", "utf8");
  const search = readFileSync("app/api/search/route.ts", "utf8");
  const client = readFileSync("app/compare/comparison-client.tsx", "utf8");
  const css = readFileSync("app/compare/compare.module.css", "utf8");
  expect(navigation).toContain('{ href: "/compare", label: "Comparador"');
  expect(search).toContain('title: "Comparador"');
  expect(client).toContain('aria-label="Periodos de comparación"');
  expect(client).toContain('aria-live="polite"');
  expect(client).toContain("window.history.replaceState");
  expect(css).toContain("@media (max-width: 38rem)");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});

test("CMP-009 mantiene contrato finito y estado vacío cuando ambos periodos valen cero", () => {
  const gateway = gatewayFixture();
  gateway.current = {
    ...gateway.current,
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
    quality: { ...gateway.current.quality, scopedRows: 0, includedRows: 0, manuallyExcludedRows: 0 },
  };
  gateway.previous = {
    ...gateway.previous,
    incomeCents: 0,
    expenseCents: 0,
    operatingNetCents: 0,
    savingsCents: 0,
    savingsRateBps: null,
    quality: { ...gateway.previous.quality, scopedRows: 0, includedRows: 0, manuallyExcludedRows: 0 },
  };
  gateway.categories = [];
  gateway.merchants = [];

  const selection = resolveComparisonSelection({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-10",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-05",
  }, "2026-09-25");
  const snapshot = buildComparisonSnapshot({ selection, gateway });
  expect(snapshot.metrics.expense.changeBps).toBeNull();
  expect(snapshot.metrics.expense.dailyDeltaCents).toBe(0);
  expect(snapshot.categoryDrivers).toEqual([]);
  expect(snapshot.quality.reconciled).toBe(true);
  expect(isComparisonSnapshot(snapshot)).toBe(true);
  expectFiniteNumbers(snapshot);
});

test("CMP-010 la API rechaza parámetros ajenos e incompletos antes de consultar datos", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const unknown = await getComparison(new Request("http://local.test/api/compare?unexpected=true"));
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("cache-control")).toBe("private, no-store");
    expect(unknown.headers.get("x-comparison-contract")).toBe("1");
    await expect(unknown.json()).resolves.toMatchObject({
      error: "invalid_request",
      code: "invalid_comparison_parameter",
    });

    const incomplete = await getComparison(new Request("http://local.test/api/compare?primaryFrom=2026-09-01"));
    expect(incomplete.status).toBe(400);
    await expect(incomplete.json()).resolves.toMatchObject({
      error: "invalid_request",
      code: "invalid_comparison_periods",
    });

    const duplicated = await getComparison(new Request("http://local.test/api/compare?primaryFrom=2026-09-01&primaryFrom=2026-09-02"));
    expect(duplicated.status).toBe(400);
    await expect(duplicated.json()).resolves.toMatchObject({
      error: "invalid_request",
      code: "invalid_comparison_parameter",
    });
  } finally {
    console.error = originalError;
  }
});
