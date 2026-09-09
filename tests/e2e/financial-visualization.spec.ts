import { expect, test, type Page } from "@playwright/test";

const categoryId = "20000000-0000-4000-8000-000000000061";

async function rejectUnexpectedWrites(page: Page, pathname: string, payload: unknown) {
  await page.route(`**${pathname}*`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "visualization_must_be_read_only" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

const analysisSnapshot = {
  contractVersion: 1,
  month: "2026-09",
  current: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    incomeCents: 55000,
    expenseCents: 60000,
    operatingNetCents: -5000,
    savingsCents: -5000,
    savingsRateBps: -909,
  },
  previous: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    incomeCents: 70000,
    expenseCents: 60000,
    operatingNetCents: 10000,
    savingsCents: 10000,
    savingsRateBps: 1429,
  },
  comparison: {
    incomeDeltaCents: -15000,
    incomeChangeBps: -2143,
    expenseDeltaCents: 0,
    expenseChangeBps: 0,
    netDeltaCents: -15000,
    netChangeBps: -15000,
  },
  categoryDrivers: [
    { id: categoryId, name: "Supermercado", expenseCents: 60000, shareBps: 10000, rows: 7, href: `/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=${categoryId}` },
  ],
  merchantDrivers: [
    { id: null, name: "Sin comercio", expenseCents: 60000, shareBps: 10000, rows: 7, href: null },
  ],
  quality: { expenseRows: 7, excludedRows: 0, confirmedDuplicateRows: 0, reconciled: true },
  principles: { bankSource: "read_only", totals: "financial_period", drivers: "effective_transaction_query" },
};

const budgetSnapshot = {
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
    automaticAmountCents: 100000,
    manualAmountCents: null,
    effectiveAmountCents: 100000,
    actualExpenseCents: 65000,
    remainingCents: 35000,
    progressBps: 6500,
    status: "on_track",
    automaticExplanation: "Media histórica.",
    historyMonths: [],
  },
  categories: [
    {
      id: null,
      persisted: false,
      categoryId,
      categoryName: "Supermercado",
      categoryLifecycle: "active",
      automaticAmountCents: 40000,
      manualAmountCents: null,
      effectiveAmountCents: 40000,
      actualExpenseCents: 65000,
      remainingCents: -25000,
      progressBps: 16250,
      status: "over",
      automaticExplanation: "Media histórica.",
      historyMonths: [],
    },
  ],
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

const forecastSnapshot = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-08", dateTo: "2026-10-08", accountId: null },
  summary: {
    openingBalanceCents: 100000,
    projectedIncomeCents: 50000,
    projectedExpenseCents: 30000,
    projectedNetCents: 20000,
    projectedClosingBalanceCents: 120000,
    plannedItems: 3,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: "81000000-0000-4000-8000-000000000001",
      date: "2026-09-10",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Pago A",
      amountCents: -10000,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -10000,
      projectedBalanceAfterCents: 85000,
      actual: null,
    },
    {
      id: "81000000-0000-4000-8000-000000000002",
      date: "2026-09-18",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Ingreso B",
      amountCents: 50000,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: 50000,
      projectedBalanceAfterCents: 135000,
      actual: null,
    },
    {
      id: "81000000-0000-4000-8000-000000000003",
      date: "2026-09-25",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Pago C",
      amountCents: -20000,
      origin: "manual",
      confidence: "medium",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -20000,
      projectedBalanceAfterCents: 120000,
      actual: null,
    },
  ],
  budgetContext: [],
  balanceContext: { quality: { accounts: 1, integrityDeltaAccounts: 0, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 }, accounts: [] },
  principles: {
    bankSource: "read_only",
    openingBalanceSource: "financial_account_balances",
    recurrenceSource: "active_recurrences_only",
    budgetsCreateDatedItems: false,
    excludedItemsAffectCashFlow: false,
    confirmedItemsAffectCashFlow: false,
    getHasSideEffects: false,
  },
};

test("F · Análisis ofrece visualización accesible, tabla alternativa, tooltip por foco y neto divergente", async ({ page }) => {
  await rejectUnexpectedWrites(page, "/api/analysis", analysisSnapshot);
  await page.goto("/analysis");

  const visual = page.getByRole("region", { name: "Comparativa financiera visual" });
  await expect(visual).toBeVisible();

  const table = page.getByRole("table", { name: "Datos de la comparativa financiera" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row", { name: /Neto/i })).toContainText(/-50,00/);
  await expect(table.getByRole("row", { name: /Neto/i })).toContainText(/100,00/);

  const deficitPoint = visual.getByRole("button", { name: /Neto.*septiembre.*-50,00.*déficit/i });
  await deficitPoint.focus();
  await expect(page.getByRole("tooltip")).toContainText(/Neto.*-50,00.*déficit/i);
  await expect(visual.getByRole("link", { name: /Ver movimientos del periodo/i })).toHaveAttribute("href", /dateFrom=2026-09-01.*dateTo=2026-09-30/);
});

test("F · Presupuestos representa la magnitud del exceso y enlaza con los movimientos causantes", async ({ page }) => {
  await rejectUnexpectedWrites(page, "/api/budgets", budgetSnapshot);
  await page.goto("/budgets");

  const magnitude = page.getByRole("group", { name: "Magnitud del presupuesto · Supermercado" });
  await expect(magnitude).toBeVisible();
  await expect(magnitude).toContainText(/Exceso.*250,00/);
  await expect(magnitude).toContainText(/62,50\s*%.*sobre el límite/i);
  await expect(magnitude).toHaveAttribute("data-budget-state", "over");
  await expect(page.getByRole("link", { name: /Ver movimientos que explican el gasto de Supermercado/i })).toHaveAttribute(
    "href",
    new RegExp(`dateFrom=2026-09-01.*dateTo=2026-09-30.*kind=expense.*categoryId=${categoryId}`),
  );
});

test("F · Previsión dibuja y tabula la curva desde projectedBalanceAfterCents sin recalcular saldos", async ({ page }) => {
  await rejectUnexpectedWrites(page, "/api/forecast", forecastSnapshot);
  await page.goto("/forecast");

  const curve = page.getByRole("region", { name: "Curva de saldo prevista" });
  await expect(curve).toBeVisible();

  const table = page.getByRole("table", { name: "Datos de la curva de saldo" });
  await expect(table.getByRole("row", { name: /Saldo inicial/i })).toContainText(/1\.000,00/);
  await expect(table.getByRole("row", { name: /Pago A/i })).toContainText(/850,00/);
  await expect(table.getByRole("row", { name: /Ingreso B/i })).toContainText(/1\.350,00/);
  await expect(table.getByRole("row", { name: /Pago C/i })).toContainText(/1\.200,00/);

  const point = curve.getByRole("button", { name: /Pago A.*850,00/i });
  await point.focus();
  await expect(page.getByRole("tooltip")).toContainText(/Pago A.*850,00/i);
});
