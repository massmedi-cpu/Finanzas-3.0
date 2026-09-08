import { expect, test, type Page } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000211";
const categoryId = "20000000-0000-4000-8000-000000000211";
const merchantId = "30000000-0000-4000-8000-000000000211";
const transactionId = "60000000-0000-4000-8000-000000000211";

const row = {
  id: transactionId,
  bankDate: "2026-09-08",
  amountCents: -1234,
  balanceAfterCents: 188796,
  account: { id: accountId, name: "Cuenta corriente de prueba" },
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
    sourceRecordId: "70000000-0000-4000-8000-000000000211",
    sourceRowIdentity: "accessibility::sheet::CC-04001",
    sourceFileId: "accessibility-source",
    sourceSheetId: "accessibility-sheet",
    sourceRowKey: "CC-04001",
    sourceFingerprint: "d".repeat(64),
    importedAt: "2026-09-08T05:00:00.000Z",
  },
};

async function mockTransactions(page: Page, writes: Array<Record<string, unknown>> = []) {
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      writes.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { requestedTransactions: 1, changedTransactions: 1, auditChanges: 1 } }) });
      return;
    }
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        accounts: [{ id: accountId, name: "Cuenta corriente de prueba", lifecycle: "active", sort_order: 0 }],
        categories: [{ id: categoryId, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
        merchants: [{ id: merchantId, name: "Supermercado Demo", lifecycle: "active" }],
      }) });
      return;
    }
    if (url.searchParams.get("mode") === "duplicate-group") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      rows: [row], totalCount: 2, hasMore: true, nextCursor: { bankDate: row.bankDate, id: row.id },
    }) });
  });
}

test("Movimientos conserva targets táctiles de al menos 44 px en 360, 430 y 480", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz táctil se ejecuta una vez por run");
  await mockTransactions(page);
  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible();
    const undersized = await page.locator("main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled]), main textarea:not([disabled]), main summary").evaluateAll((elements) =>
      elements.filter((element) => {
        const node = element as HTMLElement;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
      }).map((element) => {
        const node = element as HTMLElement;
        const label = node.getAttribute("aria-label") ?? node.textContent ?? node.getAttribute("name") ?? "";
        return `${node.tagName.toLowerCase()}:${Math.round(node.getBoundingClientRect().height)}px:${label.trim().slice(0, 36)}`;
      }),
    );
    expect(undersized, `${width}px debe conservar hit areas de 44px`).toEqual([]);
  }
});

test("Movimientos mantiene estado, contexto y trazabilidad funcional en al menos 14 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la medición tipográfica se ejecuta una vez por run");
  await mockTransactions(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/transactions");
  const targets = [
    page.getByText("Coincidencias", { exact: true }),
    page.getByText("Filtros activos", { exact: true }),
    page.getByText("Seleccionados", { exact: true }),
    page.getByText("1 de 2", { exact: true }).first(),
    page.getByText("Supermercado Demo", { exact: true }).first(),
    page.getByText("Modificado", { exact: true }),
    page.getByText("Confirmado", { exact: true }).first(),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }
  await page.getByText("Detalle y trazabilidad", { exact: true }).click();
  for (const target of [
    page.getByText("Concepto original", { exact: true }),
    page.getByText("Saldo tras movimiento", { exact: true }),
    page.getByText("Fila de origen", { exact: true }),
  ]) {
    await expect(target).toBeVisible();
    const fontSize = await target.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }
  await page.getByTestId(`edit-${transactionId}`).click();
  const editorHelper = page.getByText("Solo se modifica la capa personal de overrides.", { exact: true });
  await expect(editorHelper).toBeVisible();
  const helperFontSize = await editorHelper.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(helperFontSize).toBeGreaterThanOrEqual(14);
});

test("Movimientos asocia el error de concepto al campo, conserva foco y bloquea PATCH inválidos", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockTransactions(page, writes);
  await page.goto("/transactions");
  await page.getByTestId(`edit-${transactionId}`).click();
  const concept = page.getByTestId("edit-concept");
  await concept.fill("");
  await page.getByTestId("save-edit").click();
  expect(writes).toHaveLength(0);
  await expect(concept).toBeFocused();
  await expect(concept).toHaveAttribute("aria-invalid", "true");
  const describedBy = await concept.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const fieldError = page.locator(`#${describedBy}`);
  await expect(fieldError).toHaveAttribute("role", "alert");
  await expect(fieldError).toContainText("El concepto no puede quedar vacío");
  await concept.fill("Concepto corregido");
  await expect(concept).toHaveAttribute("aria-invalid", "false");
  await expect(fieldError).toHaveCount(0);
  await page.getByTestId("save-edit").click();
  expect(writes).toHaveLength(1);
});
