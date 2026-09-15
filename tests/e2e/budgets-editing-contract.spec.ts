import { expect, test } from "@playwright/test";

test("edición manual mantiene prioridad del usuario sin ocultar el automático", async ({ page }) => {
  const base = {
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
      actualExpenseCents: 50000,
      remainingCents: 50000,
      progressBps: 5000,
      status: "on_track",
      automaticExplanation: "Media de los tres meses completos anteriores.",
      historyMonths: [],
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

  await page.route("**/api/budgets*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(base) });
      return;
    }
    const payload = request.postDataJSON() as { manualAmountCents?: number | null };
    const manual = payload.manualAmountCents ?? null;
    const effective = manual ?? base.total.automaticAmountCents;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...base,
        total: {
          ...base.total,
          persisted: true,
          manualAmountCents: manual,
          effectiveAmountCents: effective,
          remainingCents: effective - base.total.actualExpenseCents,
          progressBps: Math.round(base.total.actualExpenseCents * 10000 / effective),
        },
      }),
    });
  });

  await page.goto("/budgets");
  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
  await page.getByLabel("Presupuesto manual de total mensual").fill("1.250,00");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Límite manual guardado");
  await expect(page.getByText(/Manual · automático 1\.000,00/)).toBeVisible();
});
