import { expect, test } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000111";
const rootCategoryId = "20000000-0000-4000-8000-000000000111";
const childCategoryId = "20000000-0000-4000-8000-000000000112";
const transactionId = "60000000-0000-4000-8000-000000000111";

const row = {
  id: transactionId,
  bankDate: "2026-09-05",
  amountCents: -1234,
  balanceAfterCents: 188796,
  account: { id: accountId, name: "Cuenta corriente Openbank · 3967" },
  concept: {
    original: "TPV SUPERMERCADO ORIGINAL",
    processed: "TPV SUPERMERCADO ORIGINAL",
    effective: "Compra supermercado",
  },
  merchant: {
    originalId: null,
    originalName: null,
    effectiveId: null,
    effectiveName: null,
  },
  category: {
    originalId: rootCategoryId,
    originalName: "Alimentación",
    effectiveId: rootCategoryId,
    effectiveName: "Alimentación",
  },
  kind: { original: "expense", effective: "expense" },
  reviewState: { original: "pending", effective: "pending" },
  duplicateState: "none",
  signMismatch: false,
  transferPairId: null,
  excludedFromAnalytics: false,
  userNote: null,
  hasUserOverride: false,
  overriddenFields: [],
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

async function mockTransactionApi(page: import("@playwright/test").Page, patchBodies: unknown[]) {
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "PATCH") {
      patchBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { requestedTransactions: 1, changedTransactions: 1, auditChanges: 1 } }),
      });
      return;
    }

    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [{ id: accountId, name: "Cuenta corriente Openbank · 3967", lifecycle: "active", sort_order: 0 }],
          categories: [
            { id: rootCategoryId, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 },
            { id: childCategoryId, name: "Supermercado", kind: "expense", lifecycle: "active", parent_category_id: rootCategoryId, sort_order: 0 },
          ],
          merchants: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [row], totalCount: 1, hasMore: false, nextCursor: null }),
    });
  });
}

test("REL-068: Movimientos expone semántica de tabla y gestión de foco accesible", async ({ page }) => {
  const patchBodies: unknown[] = [];
  await mockTransactionApi(page, patchBodies);
  await page.goto("/transactions");

  const headers = page.locator("thead th");
  await expect(headers).toHaveCount(7);
  for (let index = 0; index < 7; index += 1) {
    await expect(headers.nth(index)).toHaveAttribute("scope", "col");
  }

  await page.getByTestId(`edit-${transactionId}`).click();
  const concept = page.getByTestId("edit-concept");
  await expect(concept).toBeFocused();

  const categoryRoot = page.getByTestId("edit-category-root");
  await categoryRoot.selectOption("__none__");
  await categoryRoot.selectOption(rootCategoryId);

  const subcategory = page.getByTestId("edit-subcategory");
  await expect(subcategory).toBeEnabled();
  await expect(subcategory).toHaveValue("");

  await page.getByTestId("save-edit").click();

  await expect(subcategory).toBeFocused();
  await expect(subcategory).toHaveAttribute("aria-invalid", "true");
  await expect(subcategory).toHaveAttribute("aria-describedby", "transaction-subcategory-error");

  const error = page.locator("#transaction-subcategory-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toHaveText("Selecciona una subcategoría.");
  expect(patchBodies).toHaveLength(0);
});
