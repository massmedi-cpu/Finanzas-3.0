import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkHomeConsistency } from "../../src/application/dashboard/home-consistency";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

const today = "2026-09-27";
const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: today,
    incomeCents: 200_000,
    expenseCents: 61_445,
    operatingNetCents: 138_555,
  },
  balances: {
    asOfDate: today,
    activeBalanceCents: 1_000_000,
    accounts: [
      { lifecycle: "active" as const, balanceCents: 700_000 },
      { lifecycle: "active" as const, balanceCents: 300_000 },
    ],
  },
};
const monthly = {
  dateTo: today,
  rows: [{
    monthStart: "2026-09-01",
    incomeCents: 200_000,
    expenseCents: 61_445,
    operatingNetCents: 138_555,
  }],
};
const budget = { month: "2026-09", total: { actualExpenseCents: 61_445 } };
const forecast = {
  period: { dateFrom: today },
  summary: { openingBalanceCents: 1_000_000 },
};

test("10.0.23 Inicio rechaza bases financieras divergentes", () => {
  expect(checkHomeConsistency({ financial, monthly, budget, forecast, today })).toEqual({
    balancesMatch: true,
    currentMonthMatches: true,
    budgetMonthMatches: true,
    budgetActualMatches: true,
    forecastOpeningBalanceMatches: true,
  });

  expect(checkHomeConsistency({
    financial,
    monthly,
    budget: { ...budget, total: { actualExpenseCents: 61_444 } },
    forecast,
    today,
  }).budgetActualMatches).toBe(false);

  expect(checkHomeConsistency({
    financial,
    monthly,
    budget,
    forecast: { ...forecast, summary: { openingBalanceCents: 999_999 } },
    today,
  }).forecastOpeningBalanceMatches).toBe(false);
});

test("10.0.23 Inicio degrada de forma segura si una respuesta auxiliar llega incompleta", () => {
  const incompleteBudget = { month: "2026-09" } as unknown as typeof budget;
  const incompleteForecast = { summary: { openingBalanceCents: 1_000_000 } } as unknown as typeof forecast;

  const result = checkHomeConsistency({
    financial,
    monthly,
    budget: incompleteBudget,
    forecast: incompleteForecast,
    today,
  });

  expect(result.budgetActualMatches).toBe(false);
  expect(result.forecastOpeningBalanceMatches).toBe(false);
});

test("10.0.23 alinea Inicio, Análisis, Presupuestos y Previsión con las fuentes canónicas", () => {
  const migration = read("supabase/migrations/20260927100500_cross_module_financial_consistency.sql");
  const phase5 = read("supabase/migrations/20260905225500_phase5_financial_logic_core.sql");
  const budgetEngine = read("supabase/migrations/20260906085704_phase6_budget_engine_core.sql");
  const analysis = read("supabase/functions/financial-app-db-gateway/analysis-query.ts");
  const home = read("app/inicio-overview.tsx");

  expect(migration).toContain("financial_app.financial_account_balances(p_date_from, false, p_account_id)");
  expect(migration).not.toContain("financial_account_balances(p_date_from - 1");
  expect(migration).toContain("'openingBalanceSource','financial_account_balances_same_day'");

  expect(phase5).toContain("'period',financial_app.financial_period_summary(p_date_from,p_date_to,p_account_id)");
  expect(phase5).toContain("'balances',financial_app.financial_account_balances(p_date_to,p_include_archived)");
  expect(analysis).toContain("financial_app.financial_period_summary");
  expect(budgetEngine).toContain("financial_app.financial_transaction_facts(v_start, v_end, null)");
  expect(budgetEngine).toContain("effective_kind = 'expense'");

  expect(home).toContain("openingBalanceCents: number;");
  expect(home).toContain("budget: data.budgets");
  expect(home).toContain("forecast: data.forecast");
  expect(home).toContain("const budget = consistency.budgetMonthMatches && consistency.budgetActualMatches ? data.budgets : null;");
  expect(home).toContain("const forecast = consistency.forecastOpeningBalanceMatches ? data.forecast : null;");
});

test("Axioma §119 mantiene el gate transversal conectado a todos los módulos financieros", () => {
  const workflow = read(".github/workflows/cross-module-financial-consistency.yml");
  const requiredPaths = [
    "app/inicio-overview.tsx",
    "app/accounts/**",
    "app/transactions/**",
    "app/analysis/**",
    "app/budgets/**",
    "app/forecast/**",
    "app/api/financial/**",
    "app/api/transactions/**",
    "app/api/budgets/**",
    "app/api/forecast/**",
    "src/application/dashboard/**",
    "supabase/functions/financial-app-db-gateway/**",
    "supabase/migrations/20260905225500_phase5_financial_logic_core.sql",
    "supabase/migrations/20260906085704_phase6_budget_engine_core.sql",
    "supabase/migrations/20260906171000_phase8_forecast_engine_core.sql",
    "supabase/migrations/20260927100500_cross_module_financial_consistency.sql",
    "tests/e2e/forecast-period-integrity.spec.ts",
    ".github/workflows/forecast-period-integrity-certification.yml",
  ];

  for (const path of requiredPaths) {
    expect(workflow, `el gate transversal debe vigilar ${path}`).toContain(`'${path}'`);
  }
});
