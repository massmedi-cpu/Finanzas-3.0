import { expect, test } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000111";
const categoryId = "20000000-0000-4000-8000-000000000111";
const merchantId = "30000000-0000-4000-8000-000000000111";
const firstId = "60000000-0000-4000-8000-000000000111";
const secondId = "60000000-0000-4000-8000-000000000112";
const duplicatePeerId = "60000000-0000-4000-8000-000000000113";
const transferCandidateId = "60000000-0000-4000-8000-000000000114";

const firstRow = {
  id: firstId,
  bankDate: "2026-09-05",
  amountCents: -1234,
  balanceAfterCents: 188796,
  account: { id: accountId, name: "Cuenta corriente Openbank · 3967" },
  concept: { original: "TPV SUPERMERCADO ORIGINAL", processed: "TPV SUPERMERCADO ORIGINAL", effective: "Compra supermercado corregida" },
  merchant: { originalId: null, originalName: null, effectiveId: merchantId, effectiveName: "Supermercado Demo" },
  category: { originalId: null, originalName: null, effectiveId: categoryId, effectiveName: "Alimentación" },
  kind: { original: "expense", effective: "expense" },
  reviewState: { original: "pending", effective: "confirmed" },
  duplicateState: "suspected",
  transferPairId: null,
  excludedFromAnalytics: false,
  userNote: "Compra revisada",
  hasUserOverride: true,
  overriddenFields: ["concept", "merchant", "category", "reviewState", "note"],
  source: {
    sourceRecordId: "70000000-0000-4000-8000-000000000111",
    sourceRowIdentity: "source::sheet::CC-03021",
    sourceFileId: "source-file-demo",
    sourceSheetId: "725351515",
    sourceRowKey: "CC-03021",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-05T12:40:29.519Z",
  },
};

const secondRow = {
  ...firstRow,
  id: secondId,
  bankDate: "2026-09-04",
  amountCents: -25000,
  balanceAfterCents: 163796,
  concept: { original: "TRANSFERENCIA INTERNA", processed: "TRANSFERENCIA INTERNA", effective: "TRANSFERENCIA INTERNA" },
  merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
  category: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
  kind: { original: "transfer", effective: "transfer" },
  reviewState: { original: "pending", effective: "pending" },
  duplicateState: "none",
  transferPairId: null,
  hasUserOverride: false,
  overriddenFields: [],
  userNote: null,
  source: {
    ...firstRow.source,
    sourceRecordId: "70000000-0000-4000-8000-000000000112",
    sourceRowIdentity: "source::sheet::CC-03020",
    sourceRowKey: "CC-03020",
    sourceFingerprint: "b".repeat(64),
  },
};

type PatchBody = { transactionIds: string[]; patch: Record<string, unknown> };
type ReviewBody = Record<string, unknown> & { action: string; transactionId: string };

async function mockTransactionApi(
  page: import("@playwright/test").Page,
  patchBodies: PatchBody[] = [],
  reviewBodies: ReviewBody[] = [],
) {
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as PatchBody;
      patchBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestedTransactions: body.transactionIds.length,
            changedTransactions: body.transactionIds.length,
            auditChanges: body.transactionIds.length,
          },
        }),
      });
      return;
    }

    if (request.method() === "POST") {
      const body = request.postDataJSON() as ReviewBody;
      reviewBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { changed: true, transactionId: body.transactionId } }),
      });
      return;
    }

    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [{ id: accountId, name: "Cuenta corriente Openbank · 3967", lifecycle: "active", sort_order: 0 }],
          categories: [{ id: categoryId, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
          merchants: [{ id: merchantId, name: "Supermercado Demo", lifecycle: "active" }],
        }),
      });
      return;
    }

    if (url.searchParams.get("mode") === "duplicate-group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              id: firstId,
              account_id: accountId,
              account_name: "Cuenta corriente Openbank · 3967",
              bank_date: "2026-09-05",
              concept_normalized: "TPV SUPERMERCADO ORIGINAL",
              amount_cents: -1234,
              duplicate_state: "suspected",
              decision: null,
              review_current: false,
            },
            {
              id: duplicatePeerId,
              account_id: accountId,
              account_name: "Cuenta corriente Openbank · 3967",
              bank_date: "2026-09-05",
              concept_normalized: "TPV SUPERMERCADO ORIGINAL",
              amount_cents: -1234,
              duplicate_state: "suspected",
              decision: null,
              review_current: false,
            },
          ],
        }),
      });
      return;
    }

    if (url.searchParams.get("mode") === "transfer-candidates") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              id: transferCandidateId,
              account_id: "10000000-0000-4000-8000-000000000112",
              account_name: "Cuenta ahorro",
              bank_date: "2026-09-05",
              concept_normalized: "TRANSFERENCIA INTERNA",
              amount_cents: 25000,
              transfer_pair_id: null,
              day_gap: 1,
            },
          ],
          dayWindow: 3,
        }),
      });
      return;
    }

    if (url.searchParams.get("uncategorized") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [secondRow], totalCount: 1, hasMore: false, nextCursor: null }),
      });
      return;
    }

    const cursor = url.searchParams.get("cursorId");
    if (cursor) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [secondRow], totalCount: 2, hasMore: false, nextCursor: null }),
      });
      return;
    }

    const accountFilter = url.searchParams.get("accountId");
    const query = url.searchParams.get("q");
    const filtered = Boolean(accountFilter || query);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [firstRow],
        totalCount: filtered ? 1 : 2,
        hasMore: !filtered,
        nextCursor: filtered ? null : { bankDate: firstRow.bankDate, id: firstRow.id },
      }),
    });
  });
}

test("Movimientos muestra valores efectivos, formato español y trazabilidad sin romper responsive", async ({ page }) => {
  await mockTransactionApi(page);
  await page.goto("/transactions");

  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible();
  const firstTransaction = page.locator("tbody tr").first();
  await expect(firstTransaction.getByText("Compra supermercado corregida", { exact: true }).first()).toBeVisible();
  await expect(firstTransaction.getByText("-12,34 €", { exact: true })).toBeVisible();
  await expect(firstTransaction.getByText("Modificado", { exact: true })).toBeVisible();
  await expect(firstTransaction.locator('td[data-label="Categoría"]').getByText("Alimentación", { exact: true })).toBeVisible();

  const trace = firstTransaction.locator("details");
  await trace.locator("summary").click();
  await expect(trace.getByText("TPV SUPERMERCADO ORIGINAL", { exact: true }).first()).toBeVisible();
  await expect(trace.getByText("CC-03021", { exact: true })).toBeVisible();
  await expect(trace.getByText("Compra revisada", { exact: true })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main button, main input, main select, main summary, main a").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
});

test("Movimientos aplica filtros y pagina con cursor estable sin duplicar filas", async ({ page }) => {
  await mockTransactionApi(page);
  await page.goto("/transactions");

  const transactionRows = page.locator("tbody tr:not([class*='editorRow']):not([class*='reviewRow'])");
  await expect(page.getByText("1 de 2", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await expect(transactionRows).toHaveCount(2);
  await expect(transactionRows.nth(1).getByText("TRANSFERENCIA INTERNA", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2 movimientos", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Cuenta").selectOption(accountId);
  await page.getByLabel("Buscar").fill("supermercado");
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET" && url.pathname === "/api/transactions" && url.searchParams.get("accountId") === accountId && url.searchParams.get("q") === "supermercado";
  });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await requestPromise;
  await expect(transactionRows).toHaveCount(1);
  await expect(page.getByText("1 movimientos", { exact: true }).first()).toBeVisible();
  const summary = page.getByLabel("Resumen del listado");
  await expect(summary.locator("div").nth(0).getByText("1", { exact: true })).toBeVisible();
  await expect(summary.locator("div").nth(1).getByText("2", { exact: true })).toBeVisible();
  await expect(summary.locator("div").nth(2).getByText("0", { exact: true })).toBeVisible();
});

test("Movimientos filtra sin categoría por el valor efectivo", async ({ page }) => {
  await mockTransactionApi(page);
  await page.goto("/transactions");

  await page.getByTestId("category-filter").selectOption("__uncategorized__");
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET" && url.searchParams.get("uncategorized") === "true" && !url.searchParams.has("categoryId");
  });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await requestPromise;
  await expect(page.getByText("TRANSFERENCIA INTERNA", { exact: true }).first()).toBeVisible();
  await expect(page.locator('td[data-label="Categoría"]').getByText("Sin categoría", { exact: true })).toBeVisible();
});

test("Edición individual envía un override no destructivo", async ({ page }) => {
  const patches: PatchBody[] = [];
  await mockTransactionApi(page, patches);
  await page.goto("/transactions");

  await page.getByTestId(`edit-${firstId}`).click();
  await page.getByTestId("edit-concept").fill("Compra supermercado personalizada");
  await page.getByTestId("edit-review").selectOption("needs_review");
  await page.getByTestId("save-edit").click();

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].transactionIds).toEqual([firstId]);
  expect(patches[0].patch).toMatchObject({
    concept: "Compra supermercado personalizada",
    merchantMode: "set",
    merchantId,
    categoryMode: "set",
    categoryId,
    reviewState: "needs_review",
    excludedFromAnalytics: false,
    note: "Compra revisada",
  });
  await expect(page.getByText(/Movimiento actualizado/)).toBeVisible();
});

test("Selección múltiple aplica categoría y revisión en una sola operación", async ({ page }) => {
  const patches: PatchBody[] = [];
  await mockTransactionApi(page, patches);
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Cargar 50 más" }).click();

  await page.getByTestId(`select-${firstId}`).check();
  await page.getByTestId(`select-${secondId}`).check();
  await page.getByTestId("bulk-category").selectOption(categoryId);
  await page.getByTestId("bulk-review").selectOption("confirmed");
  await page.getByTestId("bulk-apply").click();

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].transactionIds).toEqual([firstId, secondId]);
  expect(patches[0].patch).toEqual({ categoryMode: "set", categoryId, reviewState: "confirmed" });
  await expect(page.getByText(/Edición masiva completada/)).toBeVisible();
});

test("Revisión de duplicado muestra el grupo y guarda una decisión auditable", async ({ page }) => {
  const reviews: ReviewBody[] = [];
  await mockTransactionApi(page, [], reviews);
  await page.goto("/transactions");

  await page.getByTestId(`review-duplicate-${firstId}`).click();
  await expect(page.getByTestId("duplicate-group").locator("div").filter({ hasText: "Movimiento actual" }).first()).toBeVisible();
  await expect(page.getByTestId("duplicate-group").getByText("-12,34 €", { exact: true })).toHaveCount(2);
  await page.getByTestId("duplicate-confirm").click();

  await expect.poll(() => reviews.length).toBe(1);
  expect(reviews[0]).toEqual({ action: "duplicate-review", transactionId: firstId, decision: "confirmed" });
  await expect(page.getByText("Duplicado confirmado y auditado.", { exact: true })).toBeVisible();
});

test("Transferencia interna solo ofrece contraparte equilibrada y envía el emparejado explícito", async ({ page }) => {
  const reviews: ReviewBody[] = [];
  await mockTransactionApi(page, [], reviews);
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Cargar 50 más" }).click();

  await page.getByTestId(`review-transfer-${secondId}`).click();
  const candidates = page.getByTestId("transfer-candidates");
  await expect(candidates.getByText("Cuenta ahorro", { exact: true })).toBeVisible();
  await expect(candidates.getByText("250,00 €", { exact: true })).toBeVisible();
  await expect(candidates.getByText("1 día", { exact: true })).toBeVisible();
  await page.getByTestId(`transfer-pair-${transferCandidateId}`).click();

  await expect.poll(() => reviews.length).toBe(1);
  expect(reviews[0]).toEqual({ action: "transfer-pair", transactionId: secondId, pairId: transferCandidateId });
  await expect(page.getByText("Transferencia interna emparejada y auditada.", { exact: true })).toBeVisible();
});

test("Preview protegido real expone el histórico persistido y revisiones en lectura sin escribir datos", async ({ request }) => {
  test.skip(!process.env.VERCEL_PREVIEW_URL, "Gate live: solo se ejecuta contra el preview protegido.");

  const response = await request.get("/api/transactions?limit=1");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.totalCount).toBeGreaterThanOrEqual(3172);
  expect(Array.isArray(payload.rows)).toBe(true);
  expect(payload.rows).toHaveLength(1);
  expect(payload.rows[0]?.source?.sourceRecordId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(payload.rows[0]?.account?.name).toBeTruthy();
  expect(typeof payload.rows[0]?.amountCents).toBe("number");

  const uncategorized = await request.get("/api/transactions?uncategorized=true&limit=1");
  expect(uncategorized.ok()).toBe(true);
  const uncategorizedPayload = await uncategorized.json();
  expect(Array.isArray(uncategorizedPayload.rows)).toBe(true);
  if (uncategorizedPayload.rows.length === 1) {
    expect(uncategorizedPayload.rows[0]?.category?.effectiveId).toBeNull();
  }

  const suspected = await request.get("/api/transactions?duplicateState=suspected&limit=1");
  expect(suspected.ok()).toBe(true);
  const suspectedPayload = await suspected.json();
  if (suspectedPayload.rows?.length === 1) {
    const transactionId = suspectedPayload.rows[0].id;
    const group = await request.get(`/api/transactions?mode=duplicate-group&transactionId=${transactionId}`);
    expect(group.ok()).toBe(true);
    const groupPayload = await group.json();
    expect(Array.isArray(groupPayload.rows)).toBe(true);
    expect(groupPayload.rows.length).toBeGreaterThanOrEqual(2);
  }

  const transfers = await request.get("/api/transactions?kind=transfer&limit=1");
  expect(transfers.ok()).toBe(true);
  const transferPayload = await transfers.json();
  if (transferPayload.rows?.length === 1) {
    const transactionId = transferPayload.rows[0].id;
    const candidates = await request.get(`/api/transactions?mode=transfer-candidates&transactionId=${transactionId}&dayWindow=3`);
    expect(candidates.ok()).toBe(true);
    const candidatePayload = await candidates.json();
    expect(Array.isArray(candidatePayload.rows)).toBe(true);
  }
});
