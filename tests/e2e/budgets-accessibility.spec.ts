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

async function mockBudgetRead(page: Parameters<typeof test>[0] extends never ? never : any) {
  await page.route("**/api/budgets**", async (route: any) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
      return;
    }
    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "method_not_allowed" }) });
  });
}

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

test("Presupuestos conserva targets táctiles de al menos 44 px en 360, 430 y 480", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz táctil se ejecuta una vez por run");
  await mockBudgetRead(page);

  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/budgets");
    const undersized = await page.locator("main a[href], main button:not([disabled]), main input:not([disabled])").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const node = element as HTMLElement;
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
        })
        .map((element) => `${element.tagName.toLowerCase()}:${Math.round((element as HTMLElement).getBoundingClientRect().height)}px:${(element.textContent ?? "").trim().slice(0, 32)}`),
    );
    expect(undersized, `${width}px debe conservar hit areas de 44px`).toEqual([]);
  }
});

test("Presupuestos mantiene microtexto financiero funcional en al menos 14 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la medición tipográfica se ejecuta una vez por run");
  await mockBudgetRead(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/budgets");

  const totalCard = page.getByRole("heading", { name: "Presupuesto mensual total" }).locator("xpath=ancestor::article");
  const targets = [
    page.locator("label").filter({ hasText: "Mes" }).first(),
    page.getByText("Tres conceptos distintos", { exact: true }),
    page.getByText("Media histórica", { exact: true }),
    page.getByText("Recomendación de la app", { exact: true }),
    page.getByText("Tu límite actual", { exact: true }),
    page.getByText("Automático", { exact: true }),
    page.getByText("Total mensual y detalle por categorías de gasto.", { exact: true }),
    page.getByText("En objetivo", { exact: true }).first(),
    totalCard.getByText("Gastado este mes", { exact: true }),
    totalCard.getByText("Consumo", { exact: true }),
    page.getByText("Junio", { exact: true }),
    page.getByText(snapshot.total.automaticExplanation, { exact: true }),
    page.getByText("El gasto mostrado procede de tus movimientos. El presupuesto nunca modifica la fuente bancaria.", { exact: true }),
    page.getByText("La fuente bancaria se mantiene estrictamente en solo lectura.", { exact: true }),
    page.getByText("El presupuesto total ya funciona. Cuando existan categorías de gasto activas, aparecerán aquí con su recomendación y consumo real.", { exact: true }),
    page.getByRole("link", { name: "Abrir Configuración" }),
  ];

  for (const target of targets) {
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }

  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
  const editorInput = page.getByLabel("Presupuesto manual de total mensual");
  const editorLabelSize = await editorInput.evaluate((element) => {
    const label = element.closest("label");
    if (!label) throw new Error("Budget editor input must remain inside its label");
    return Number.parseFloat(getComputedStyle(label).fontSize);
  });
  expect(editorLabelSize).toBeGreaterThanOrEqual(14);
});
