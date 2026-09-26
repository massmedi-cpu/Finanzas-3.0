import { expect, test } from "@playwright/test";

const ITEM_ID = "81000000-0000-4000-8000-000000000091";

function forecastSnapshot(dateFrom: string, dateTo: string, manual: { date: string; concept: string; amountCents: number } | null) {
  const visible = manual && manual.date >= dateFrom && manual.date <= dateTo ? manual : null;
  const projectedNetCents = visible?.amountCents ?? 0;
  return {
    contractVersion: 1,
    period: { dateFrom, dateTo, accountId: null },
    summary: {
      openingBalanceCents: 50000,
      projectedIncomeCents: Math.max(0, projectedNetCents),
      projectedExpenseCents: Math.max(0, -projectedNetCents),
      projectedNetCents,
      projectedClosingBalanceCents: 50000 + projectedNetCents,
      plannedItems: visible ? 1 : 0,
      excludedItems: 0,
      confirmedItems: 0,
    },
    items: visible ? [{
      id: ITEM_ID,
      date: visible.date,
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: visible.concept,
      amountCents: visible.amountCents,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      updatedAt: "2026-09-26T12:00:00.000Z",
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: visible.amountCents,
      projectedBalanceAfterCents: 50000 + visible.amountCents,
      actual: null,
    }] : [],
    budgetContext: [],
    balanceContext: {
      quality: { accounts: 1, integrityDeltaAccounts: 0, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 },
      accounts: [],
    },
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
}

test("la fecha manual sigue el periodo elegido y no guarda un movimiento invisible", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  let manual: { date: string; concept: string; amountCents: number } | null = null;
  await page.route("**/api/forecast*", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push(body);
      manual = { date: body.date as string, concept: body.concept as string, amountCents: body.amountCents as number };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: ITEM_ID }) });
      return;
    }
    const url = new URL(route.request().url());
    const from = url.searchParams.get("dateFrom") ?? "2026-10-01";
    const to = url.searchParams.get("dateTo") ?? "2026-10-31";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastSnapshot(from, to, manual)) });
  });

  await page.goto("/forecast?dateFrom=2026-10-01&dateTo=2026-10-31");
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue("2026-10-01");
  await page.getByLabel("Desde", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Hasta").fill("2026-11-30");
  await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue("2026-11-01");

  await page.getByLabel("Fecha", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Concepto").fill("Seguro de noviembre");
  await page.getByLabel("Importe").fill("12,34");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect(page.getByText("Elige una fecha dentro del periodo mostrado.")).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByLabel("Fecha", { exact: true }).fill("2026-11-15");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ action: "manual", date: "2026-11-15", amountCents: -1234 });
  await expect(page.getByRole("heading", { name: "Seguro de noviembre" })).toBeVisible();
});

test("la selección avisa de un horizonte de más de 730 días sin consultar el motor", async ({ page }) => {
  const requestedPeriods: string[] = [];
  await page.route("**/api/forecast*", async (route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get("dateFrom") ?? "2026-10-01";
    const to = url.searchParams.get("dateTo") ?? "2026-10-31";
    requestedPeriods.push(`${from}:${to}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastSnapshot(from, to, null)) });
  });

  await page.goto("/forecast?dateFrom=2026-10-01&dateTo=2026-10-31");
  await expect(page.getByLabel("Hasta")).toHaveValue("2026-10-31");
  await page.getByLabel("Hasta").fill("2028-11-01");
  await expect(page.locator("main").getByRole("alert")).toContainText("730 días");
  expect(requestedPeriods).not.toContain("2026-10-01:2028-11-01");
});
