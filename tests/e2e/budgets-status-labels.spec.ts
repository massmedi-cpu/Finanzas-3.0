import { expect, test } from "@playwright/test";

test("estados de presupuesto mantienen etiquetas comprensibles", async ({ page }) => {
  const make = (id: string, name: string, status: "over" | "unfunded" | "empty" | "on_track", actualExpenseCents: number) => ({
    id: null, persisted: false, categoryId: id, categoryName: name, categoryLifecycle: "active" as const,
    automaticAmountCents: status === "unfunded" ? 0 : 10000, manualAmountCents: null,
    effectiveAmountCents: status === "unfunded" ? 0 : 10000, actualExpenseCents,
    remainingCents: status === "over" || status === "unfunded" ? -Math.max(1, actualExpenseCents - 10000) : 10000 - actualExpenseCents,
    progressBps: status === "unfunded" ? null : Math.round(actualExpenseCents * 10000 / 10000),
    status, automaticExplanation: "Media.", historyMonths: [],
  });
  const snapshot = {
    contractVersion: 1, month: "2026-09", monthStart: "2026-09-01", monthEnd: "2026-09-30",
    total: { ...make("20000000-0000-4000-8000-000000000131", "Total", "on_track", 1000), categoryId: null, categoryName: null, categoryLifecycle: null },
    categories: [
      make("20000000-0000-4000-8000-000000000132", "Uno", "over", 12000),
      make("20000000-0000-4000-8000-000000000133", "Dos", "unfunded", 1000),
      make("20000000-0000-4000-8000-000000000134", "Tres", "empty", 0),
    ],
    principles: { bankSource: "read_only", actualSource: "financial_transaction_facts",
      recommendation: "trailing_3_complete_month_average", transfersConsumeBudget: false,
      confirmedDuplicatesConsumeBudget: false, manualAnalyticsExclusionsRespected: true,
      refundsNetAgainstExpense: false, manualOverrideWins: true, parentCategoryIncludesDescendants: true },
  };
  await page.route("**/api/budgets*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto("/budgets");
  await expect(page.getByText("Superado", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin límite", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin actividad", { exact: true })).toBeVisible();
});
