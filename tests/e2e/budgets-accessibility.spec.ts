import { expect, test } from "@playwright/test";

const snapshot = {
  contractVersion: 1,
  month: "2026-09",
  monthStart: "2026-09-01",
  monthEnd: "2026-09-30",
  total: {
    id: "10000000-0000-4000-8000-000000000001",
    persisted: true,
    categoryId: null,
    categoryName: null,
    categoryLifecycle: null,
    automaticAmountCents: 150000,
    manualAmountCents: null,
    effectiveAmountCents: 150000,
    actualExpenseCents: 73000,
    remainingCents: 77000,
    progressBps: 4867,
    status: "on_track",
    automaticExplanation: "Media mensual de gasto elegible de los últimos tres meses completos.",
    historyMonths: [
      { month: "2026-06", expenseCents: 130000 },
      { month: "2026-07", expenseCents: 145000 },
      { month: "2026-08", expenseCents: 175000 },
    ],
  },
  categories: [],
  principles: {
    bankSource: "read_only",
    actualSource: "effective_transactions",
    recommendation: "three_complete_month_average",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: true,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  },
};

test("Presupuestos asocia el error de importe al campo, conserva foco y limpia la validación al corregir", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];

  await page.route("**/api/budgets**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
      return;
    }

    if (request.method() === "PATCH") {
      writes.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...snapshot,
          total: {
            ...snapshot.total,
            manualAmountCents: 123456,
            effectiveAmountCents: 123456,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "method_not_allowed" }) });
  });

  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: "Presupuestos" })).toBeVisible();

  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
  const input = page.getByLabel("Presupuesto manual de total mensual");
  await expect(input).toBeFocused();

  await input.fill("1,234");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(input).toHaveAttribute("aria-invalid", "true");
  const describedBy = await input.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const fieldError = page.locator(`#${describedBy}`);
  await expect(fieldError).toHaveAttribute("role", "alert");
  await expect(fieldError).toContainText("Introduce un importe válido");
  await expect(input).toBeFocused();
  expect(writes).toHaveLength(0);

  await input.fill("1.234,56");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(fieldError).toHaveCount(0);

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Límite manual guardado");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ month: "2026-09", categoryId: null, manualAmountCents: 123456 });
});
