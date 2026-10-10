import { expect, test } from "@playwright/test";

function madridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

const TEST_MONTH = madridMonth();
const [TEST_YEAR, TEST_MONTH_NUMBER] = TEST_MONTH.split("-").map(Number);
const TEST_MONTH_START = `${TEST_MONTH}-01`;
const TEST_MONTH_END = `${TEST_MONTH}-${String(new Date(Date.UTC(TEST_YEAR, TEST_MONTH_NUMBER, 0)).getUTCDate()).padStart(2, "0")}`;

const snapshot = {
  contractVersion: 1,
  month: TEST_MONTH,
  monthStart: TEST_MONTH_START,
  monthEnd: TEST_MONTH_END,
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
    automaticExplanation: "Referencia automática Axioma §52.",
    automaticFactors: {
      algorithm: "axioma_52_budget_reference_v1",
      mode: "axioma_52_weighted",
      availableMonthCount: 12,
      trailing3AverageCents: 150000,
      recentWeightedCents: 148000,
      seasonalSameMonthCents: 152000,
      seasonalMonthCount: 1,
      trendAdjustmentCents: 1000,
      knownRecurringCents: 0,
      extraordinaryMonthCount: 0,
      extraordinaryCapCents: null,
      recurrencePolicy: "floor_not_additive",
      exclusionsSource: "financial_transaction_allocation_facts.analytics_eligible",
    },
    historyMonths: [
      { month: "2026-06", expenseCents: 130000 },
      { month: "2026-07", expenseCents: 145000 },
      { month: "2026-08", expenseCents: 175000 },
    ],
  },
  categories: [],
  principles: {
    bankSource: "read_only",
    actualSource: "financial_transaction_allocation_facts",
    recommendation: "axioma_52_weighted_history_seasonality_trend_recurrence_floor",
    transfersConsumeBudget: false,
    confirmedDuplicatesConsumeBudget: false,
    manualAnalyticsExclusionsRespected: true,
    refundsNetAgainstExpense: false,
    manualOverrideWins: true,
    parentCategoryIncludesDescendants: true,
  },
};

async function mockBudgetRead(page: Parameters<typeof test>[0] extends never ? never : any) {
  // The text/contrast fixture is explicitly a fully observed month. Without
  // this stub it would now correctly render "Estado sin verificar" instead
  // of the legacy "Dentro de referencia" tested for font size.
  await page.route("**/api/analysis/source-freshness*", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        earliestMovementDate: TEST_MONTH_START,
        latestMovementDate: TEST_MONTH_END,
        sync: {
          status: "success",
          finishedAt: TEST_MONTH_END + "T11:00:00Z",
          startedAt: TEST_MONTH_END + "T10:00:00Z",
          rowsSeen: 3,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        },
      }),
    });
  });
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
  await expect(page.getByRole("button", { name: "Definir límite" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Definir límite" }).first().click();
  const input = page.getByLabel("Límite elegido de total mensual");
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
  await expect(page.locator("#main-content").getByText("Límite elegido guardado.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ month: TEST_MONTH, categoryId: null, manualAmountCents: 123456 });
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
  await expect(page.getByRole("heading", { name: "Presupuesto mensual total" })).toBeVisible();

  const totalCard = page.getByRole("heading", { name: "Presupuesto mensual total" }).locator("xpath=ancestor::article");
  const targets = [
    page.locator("label").filter({ hasText: "Mes" }).first(),
    page.getByText("La referencia no se presenta como recomendación financiera", { exact: true }),
    page.getByText("Tu límite elegido tiene prioridad; sin él, la referencia automática se usa para comparar.", { exact: true }),
    page.getByText("Referencia automática", { exact: true }).first(),
    page.getByText("Dentro de referencia", { exact: true }).first(),
    totalCard.getByText("Gastado", { exact: true }),
    totalCard.getByText("Uso de la referencia", { exact: true }),
    page.getByText("Junio", { exact: true }),
    page.getByText(snapshot.total.automaticExplanation, { exact: true }),
    page.getByText("El gasto procede de tus movimientos. La referencia automática combina señales históricas sin convertirse en una recomendación financiera.", { exact: true }),
    page.getByText("La fuente bancaria se mantiene estrictamente en solo lectura.", { exact: true }),
    page.getByText("El total ya muestra referencia automática, límite elegido y consumo real. Cuando existan categorías de gasto activas, aparecerán aquí con la misma separación.", { exact: true }),
    page.getByRole("link", { name: "Abrir Configuración" }),
  ];

  for (const target of targets) {
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }

  await page.getByRole("button", { name: "Definir límite" }).first().click();
  const editorInput = page.getByLabel("Límite elegido de total mensual");
  const editorLabelSize = await editorInput.evaluate((element) => {
    const label = element.closest("label");
    if (!label) throw new Error("Budget editor input must remain inside its label");
    return Number.parseFloat(getComputedStyle(label).fontSize);
  });
  expect(editorLabelSize).toBeGreaterThanOrEqual(14);
});


test("AUD-E2E-UI-001 · texto funcional de Presupuestos mantiene tono legible en tema claro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockBudgetRead(page);
  await page.goto("/budgets");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const eyebrow = page.getByText("FINANCIAL APP · PRESUPUESTOS", { exact: true });
  await expect(eyebrow).toBeVisible();
  const emptyMessage = page.getByText(/El total ya muestra referencia automática, límite elegido y consumo real/);
  await expect(emptyMessage).toBeVisible();

  // El tema debe aplicar tokens de diseño, no un RGB histórico que ya no representa la paleta.
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const resolveColor = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    const result = {
      primary: resolveColor("--color-primary-bright"),
      muted: resolveColor("--color-text-muted"),
    };
    probe.remove();
    return result;
  });
  const eyebrowRgb = await eyebrow.evaluate((node) => getComputedStyle(node).color);
  const helperRgb = await emptyMessage.evaluate((node) => getComputedStyle(node).color);
  expect(eyebrowRgb).toBe(tokens.primary);
  expect(helperRgb).toBe(tokens.muted);

  const contrastAgainstWhite = (rgb: string) => {
    const channels = (rgb.match(/[0-9]+(?:\\.[0-9]+)?/g) ?? []).slice(0, 3).map(Number);
    if (channels.length !== 3) throw new Error(`Unexpected RGB value: ${rgb}`);
    const luminance = channels.reduce((sum, channel, index) => {
      const s = channel / 255;
      const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    return 1.05 / (luminance + 0.05);
  };
  expect(contrastAgainstWhite(eyebrowRgb)).toBeGreaterThanOrEqual(4.5);
  expect(contrastAgainstWhite(helperRgb)).toBeGreaterThanOrEqual(4.5);
});
