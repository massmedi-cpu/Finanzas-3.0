import { expect, test, type Page } from "@playwright/test";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000025";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000025";
const MERCHANT_ID = "30000000-0000-4000-8000-000000000025";
const TRANSACTION_ID = "60000000-0000-4000-8000-000000000025";
const DOCUMENT_ID = "90000000-0000-4000-8000-000000000025";

function maxText(label: string, length: number) {
  const words = `${label} límite visual `;
  return words.repeat(Math.ceil(length / words.length)).slice(0, length);
}

const longAccount = maxText("Cuenta", 500);
const longCategory = maxText("Categoría", 500);
const longMerchant = maxText("Comercio", 500);
const longConcept = maxText("Concepto", 240);
const longNote = maxText("Nota", 2_000);
const longFileName = `${maxText("Documento", 496)}.pdf`;

const transactionRow = {
  id: TRANSACTION_ID,
  bankDate: "2026-09-01",
  amountCents: 0,
  balanceAfterCents: 100_000,
  account: { id: ACCOUNT_ID, name: longAccount },
  concept: { original: longConcept, processed: longConcept, effective: longConcept },
  merchant: { originalId: MERCHANT_ID, originalName: longMerchant, effectiveId: MERCHANT_ID, effectiveName: longMerchant },
  category: { originalId: CATEGORY_ID, originalName: longCategory, effectiveId: CATEGORY_ID, effectiveName: longCategory },
  kind: { original: "expense", effective: "expense" },
  reviewState: { original: "confirmed", effective: "confirmed" },
  duplicateState: "none",
  transferPairId: null,
  excludedFromAnalytics: false,
  userNote: longNote,
  hasUserOverride: true,
  overriddenFields: ["note"],
  source: {
    sourceRecordId: "70000000-0000-4000-8000-000000000025",
    sourceRowIdentity: "pre025::sheet::ZERO-1",
    sourceFileId: "pre025",
    sourceSheetId: "sheet",
    sourceRowKey: "ZERO-1",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-01T10:00:00.000Z",
  },
};

async function mockTransactions(page: Page, expireFirstPatch = false) {
  const state = { patchAttempts: 0 };
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      state.patchAttempts += 1;
      if (expireFirstPatch && state.patchAttempts === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "authentication_required", code: null }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { changedTransactions: 1 } }),
      });
      return;
    }
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [{ id: ACCOUNT_ID, name: longAccount, lifecycle: "active", sort_order: 0 }],
          categories: [{ id: CATEGORY_ID, name: longCategory, kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
          merchants: [{ id: MERCHANT_ID, name: longMerchant, lifecycle: "active" }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [transactionRow], totalCount: 1, hasMore: false, nextCursor: null }),
    });
  });
  return state;
}

const documentPrinciples = {
  bankSource: "read_only",
  ocrEnabled: false,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
};

function documentItem(notes = longNote) {
  return {
    id: DOCUMENT_ID,
    type: "invoice",
    notes,
    status: "pending_review",
    mimeType: "application/pdf",
    createdAt: "2026-09-01T10:00:00.000Z",
    sizeBytes: 1_024,
    updatedAt: "2026-09-01T10:00:00.000Z",
    issuerName: maxText("Emisor", 300),
    totalCents: 0,
    documentDate: "2026-09-01",
    storageProvider: "supabase",
    associationCount: 0,
    originalFileName: longFileName,
    sourceModifiedAt: null,
    sourceDriveFileId: null,
  };
}

async function mockDocuments(page: Page, expireFirstPatch = false) {
  const state = { patchAttempts: 0, notes: longNote };
  await page.route("**/api/documents**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      state.patchAttempts += 1;
      if (expireFirstPatch && state.patchAttempts === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "authentication_required", code: null }),
        });
        return;
      }
      const body = request.postDataJSON() as { notes?: string };
      state.notes = body.notes ?? state.notes;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document: documentItem(state.notes), associations: [], principles: documentPrinciples }),
      });
      return;
    }
    if (url.searchParams.has("id")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document: documentItem(state.notes), associations: [], principles: documentPrinciples }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [documentItem(state.notes)], total: 1, limit: 50, offset: 0, principles: documentPrinciples }),
    });
  });
  return state;
}

function emptyForecast(dateFrom: string, dateTo: string) {
  return {
    contractVersion: 1,
    period: { dateFrom, dateTo, accountId: null },
    summary: {
      openingBalanceCents: 0,
      projectedIncomeCents: 0,
      projectedExpenseCents: 0,
      projectedNetCents: 0,
      projectedClosingBalanceCents: 0,
      plannedItems: 0,
      excludedItems: 0,
      confirmedItems: 0,
    },
    items: [],
    budgetContext: [],
    balanceContext: {
      quality: { accounts: 0, integrityDeltaAccounts: 0, explicitBalanceAccounts: 0, reconstructedBalanceAccounts: 0 },
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

async function mockForecast(page: Page) {
  const state = { postAttempts: 0 };
  await page.route("**/api/forecast**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") {
      state.postAttempts += 1;
      if (state.postAttempts === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "authentication_required", code: null }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "81000000-0000-4000-8000-000000000025" }) });
      return;
    }
    const dateFrom = url.searchParams.get("dateFrom") ?? "2026-09-26";
    const dateTo = url.searchParams.get("dateTo") ?? "2026-12-25";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyForecast(dateFrom, dateTo)) });
  });
  return state;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectWithinViewport(page: Page, selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  expect(bounds).not.toBeNull();
  const width = await page.evaluate(() => window.innerWidth);
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(-1);
  expect((bounds?.x ?? width) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width + 1);
}

async function mockEmptyWorkspace(page: Page) {
  await page.route("**/api/dashboard**", async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope") ?? "all";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        scope,
        asOfDate: "2026-09-25",
        dataThroughDate: null,
        generatedAt: "2026-09-25T12:00:00.000Z",
        requestedSources: [],
        failedSources: [],
        data: { financial: null, monthly: null, budgets: null, forecast: null, transactions: null },
      }),
    });
  });
  await page.route("**/api/financial**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        asOfDate: "2026-09-25",
        includeArchived: false,
        accountId: null,
        totalBalanceCents: 0,
        activeBalanceCents: 0,
        quality: { accounts: 0, explicitBalanceAccounts: 0, reconstructedBalanceAccounts: 0, integrityDeltaAccounts: 0 },
        accounts: [],
      }),
    });
  });
  await page.route("**/api/transactions**", async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode");
    const body = mode === "facets"
      ? { accounts: [], categories: [], merchants: [] }
      : { rows: [], totalCount: 0, hasMore: false, nextCursor: null };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/documents**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, items: [], total: 0, limit: 50, offset: 0, principles: documentPrinciples }),
    });
  });
  await page.route("**/api/forecast**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyForecast(url.searchParams.get("dateFrom") ?? "2026-09-26", url.searchParams.get("dateTo") ?? "2026-12-25")),
    });
  });
  await page.route("**/api/recurrences**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        dateFrom: null,
        dateTo: "2026-09-25",
        minOccurrences: 3,
        candidateCount: 0,
        candidates: [],
        principles: {
          bankSource: "read_only",
          factSource: "financial_transaction_facts",
          eligibleKinds: ["income", "expense"],
          automaticPersistence: false,
          confidenceExplicit: true,
          weakMatchesBecomeFacts: false,
          nextDateAfterAnalysisPeriod: true,
          missedCyclesReduceConfidence: true,
        },
      }),
    });
  });
  await page.route("**/api/budgets**", async (route) => {
    const month = new URL(route.request().url()).searchParams.get("month") ?? "2026-09";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        month,
        monthStart: `${month}-01`,
        monthEnd: `${month}-30`,
        total: {
          id: null,
          persisted: false,
          categoryId: null,
          categoryName: null,
          categoryLifecycle: null,
          automaticAmountCents: 0,
          manualAmountCents: null,
          effectiveAmountCents: 0,
          actualExpenseCents: 0,
          remainingCents: 0,
          progressBps: null,
          status: "empty",
          automaticExplanation: "Sin histórico suficiente.",
          historyMonths: [],
        },
        categories: [],
        principles: { bankSource: "read_only" },
        planning: {
          contractVersion: 1,
          state: "unavailable",
          objectiveState: "unavailable",
          historyDateFrom: "2026-06-01",
          historyDateTo: "2026-08-31",
          historicalBaselineCents: 0,
          selectedLimitCents: null,
          trackingReferenceCents: 0,
          differenceFromBaselineCents: null,
          averageIncomeCents: 0,
          targetSavingsCents: null,
          targetSavingsRateBps: null,
          incomeHistoryMonths: [],
          principles: {
            historicalBaseline: "trailing_3_complete_month_expense_average",
            chosenLimit: "manual_total_budget_only",
            objective: "average_income_minus_chosen_limit",
            incomeSource: "financial_monthly_series",
            financialAdvice: false,
          },
        },
      }),
    });
  });
}

test("EDGE-001/005 renders exact zero, contractual maxima and adversarial entity names at 360, 430 and 1440", async ({ page }) => {
  await mockTransactions(page);
  for (const width of [360, 430, 1_440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/transactions");
    await expect(page.getByText("0,00 €", { exact: true })).toBeVisible();
    await page.getByTestId(`edit-${TRANSACTION_ID}`).click();
    await expect(page.getByTestId("edit-concept")).toHaveValue(longConcept);
    await expect(page.getByLabel("Nota")).toHaveValue(longNote);
    await expect(page.getByTestId("save-edit")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectWithinViewport(page, '[data-testid="save-edit"]');
  }
});

test("EDGE-005 renders maximum document name, issuer and note at 360, 430 and 1440", async ({ page }) => {
  await mockDocuments(page);
  for (const width of [360, 430, 1_440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/documents");
    await page.getByRole("button", { name: new RegExp(longFileName.slice(0, 24)) }).click();
    await expect(page.getByRole("heading", { name: longFileName })).toBeVisible();
    await expect(page.getByLabel("Emisor")).toHaveValue(maxText("Emisor", 300));
    await expect(page.getByLabel("Notas")).toHaveValue(longNote);
    await expect(page.getByRole("button", { name: "Guardar metadatos" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("EDGE-007 preserves a transaction draft across expired-session failure and retry", async ({ page }) => {
  const state = await mockTransactions(page, true);
  await page.goto("/transactions");
  await page.getByTestId(`edit-${TRANSACTION_ID}`).click();
  await page.getByTestId("edit-concept").fill("Borrador de movimiento recuperable");
  await page.getByLabel("Nota").fill("Nota local todavía no persistida");
  await page.getByTestId("save-edit").click();

  await expect(page.getByTestId("draft-recovery-notice")).toBeVisible();
  await expect(page.getByTestId("draft-recovery-notice").getByRole("link")).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("edit-concept")).toHaveValue("Borrador de movimiento recuperable");
  await expect(page.getByLabel("Nota")).toHaveValue("Nota local todavía no persistida");
  expect(state.patchAttempts).toBe(1);

  await page.getByTestId("save-edit").click();
  await expect(page.getByText(/Movimiento actualizado/)).toBeVisible();
  expect(state.patchAttempts).toBe(2);
});

test("EDGE-007 preserves a document draft across expired-session failure and retry", async ({ page }) => {
  const state = await mockDocuments(page, true);
  await page.goto("/documents");
  await page.getByRole("button", { name: new RegExp(longFileName.slice(0, 24)) }).click();
  await page.getByLabel("Notas").fill("Borrador documental recuperable");
  await page.getByRole("button", { name: "Guardar metadatos" }).click();

  await expect(page.getByTestId("draft-recovery-notice")).toBeVisible();
  await expect(page.getByLabel("Notas")).toHaveValue("Borrador documental recuperable");
  expect(state.patchAttempts).toBe(1);

  await page.getByRole("button", { name: "Guardar metadatos" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Metadatos guardados" })).toBeVisible();
  expect(state.patchAttempts).toBe(2);
});

test("EDGE-007 preserves a forecast draft and idempotent retry after session expiry", async ({ page }) => {
  const state = await mockForecast(page);
  await page.goto("/forecast");
  await expect(page.getByText("No hay cargos ni ingresos previstos en este periodo.")).toBeVisible();
  await page.getByLabel("Concepto").fill("Borrador de previsión recuperable");
  await page.getByLabel("Importe").fill("123,45");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();

  await expect(page.getByTestId("draft-recovery-notice")).toBeVisible();
  await expect(page.getByLabel("Concepto")).toHaveValue("Borrador de previsión recuperable");
  await expect(page.getByLabel("Importe")).toHaveValue("123,45");
  expect(state.postAttempts).toBe(1);

  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect(page.getByLabel("Concepto")).toHaveValue("");
  await expect(page.getByLabel("Importe")).toHaveValue("");
  expect(state.postAttempts).toBe(2);
});

test("EDGE-009 renders the principal app routes for a completely empty workspace", async ({ page }) => {
  await mockEmptyWorkspace(page);
  const routes = [
    { path: "/", text: "Inicio" },
    { path: "/accounts", text: "No hay cuentas configuradas." },
    { path: "/transactions", text: "No hay movimientos que coincidan con los filtros actuales." },
    { path: "/budgets", text: "No hay categorías de gasto activas" },
    { path: "/forecast", text: "No hay cargos ni ingresos previstos en este periodo." },
    { path: "/recurrences", text: "No hay patrones con al menos 3 apariciones" },
    { path: "/documents", text: "No hay documentos" },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    if (route.path === "/") {
      await expect(page.getByRole("heading", { name: "Inicio", exact: true, level: 1 })).toBeVisible();
    } else {
      await expect(page.getByText(route.text, { exact: route.path !== "/recurrences" }).first()).toBeVisible();
    }
    await expect(page.locator("body")).not.toContainText(/NaN|Infinity/);
    await expectNoHorizontalOverflow(page);
  }
});
