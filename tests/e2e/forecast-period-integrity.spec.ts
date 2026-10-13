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
  await expect(page.getByRole("status", { name: "Evaluación de liquidez pendiente" })).toBeVisible();
  await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2026-10-01");
  await page.getByLabel("Desde", { exact: true }).fill("2024-01-01");
  await expect(page.locator("main").getByRole("alert")).toContainText("730 días");
  expect(requestedPeriods).not.toContain("2024-01-01:2026-10-31");
});


for (const failure of ["http_503", "stale_200"] as const) {
  test(failure === "http_503"
    ? "REC-FCAST-031 · uncertain manual POST retains form and original idempotency key after GET failure"
    : "REC-FCAST-032 · 200 with stale forecast cannot confirm a successful manual POST", async ({ page }) => {
    let manual: { date: string; concept: string; amountCents: number } | null = null;
    let posted = false;
    let verifyAttempt = 0;
    const idempotencyKeys: string[] = [];
    await page.route("**/api/forecast*", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        idempotencyKeys.push(req.headers()["idempotency-key"] ?? "");
        posted = true;
        manual = { date: body.date, concept: body.concept, amountCents: body.amountCents };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: ITEM_ID, origin: "manual" }) });
        return;
      }
      const url = new URL(req.url());
      const from = url.searchParams.get("dateFrom") ?? "2026-10-01";
      const to = url.searchParams.get("dateTo") ?? "2026-10-31";
      if (posted && ++verifyAttempt === 1) {
        if (failure === "http_503") {
          await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporarily_unavailable"}' });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastSnapshot(from, to, null)) });
        }
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastSnapshot(from, to, manual)) });
    });

    await page.goto("/forecast?dateFrom=2026-10-01&dateTo=2026-10-31");
    const concept = page.getByLabel("Concepto");
    const amount = page.getByLabel("Importe");
    await concept.fill("Seguro de octubre verificado");
    await amount.fill("18,90");
    await page.getByRole("button", { name: "Añadir al calendario" }).click();
    await expect.poll(() => idempotencyKeys.length).toBe(1);
    await expect(page.locator("main").getByRole("alert")).toContainText("puede haberse");
    await expect(concept).toHaveValue("Seguro de octubre verificado");
    await expect(amount).toHaveValue("18,90");
    await expect(page.getByText("Previsión manual añadida y verificada en el calendario.")).toHaveCount(0);

    await page.getByRole("button", { name: "Añadir al calendario" }).click();
    await expect(page.getByRole("heading", { name: "Seguro de octubre verificado" })).toBeVisible();
    await expect(page.getByText("Previsión manual añadida y verificada en el calendario.")).toBeVisible();
    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
    await expect(concept).toHaveValue("");
    await expect(amount).toHaveValue("");
  });
}


for (const invalidResponse of ["other_period", "invalid_amount"] as const) {
  test(invalidResponse === "other_period"
    ? "REC-FCAST-035 · HTTP 200 with a different forecast period never displays another month's money"
    : "REC-FCAST-036 · HTTP 200 with unsafe forecast totals is not financial evidence", async ({ page }) => {
    let reads = 0;
    await page.route("**/api/forecast*", async (route) => {
      reads += 1;
      const url = new URL(route.request().url());
      const from = url.searchParams.get("dateFrom") ?? "2026-10-01";
      const to = url.searchParams.get("dateTo") ?? "2026-10-31";
      const valid = forecastSnapshot(from, to, {
        date: "2026-10-15", concept: "DATO AJENO NO VERIFICADO", amountCents: -8999,
      });
      const payload = invalidResponse === "other_period"
        ? { ...valid, period: { ...valid.period, dateFrom: "2026-09-01" } }
        : { ...valid, summary: { ...valid.summary, projectedClosingBalanceCents: Number.MAX_SAFE_INTEGER + 10 } };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto("/forecast?dateFrom=2026-10-01&dateTo=2026-10-31");
    await expect(page.locator("main").getByRole("alert")).toContainText("No se mostrarán como previsión verificada");
    await expect(page.getByRole("heading", { name: "DATO AJENO NO VERIFICADO" })).toHaveCount(0);
    await expect(page.getByText("Previsión manual añadida y verificada en el calendario.")).toHaveCount(0);
    expect(reads).toBeGreaterThanOrEqual(1);
  });
}
