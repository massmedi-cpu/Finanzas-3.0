import { expect, test, type Page } from "@playwright/test";

// REC-SYNC-634: Isolated browser tests use synthetic aggregate data only.
// Never connect to the bank source, import data or send an authenticated POST.
const verifiedCoverage = {
  status: "verified",
  scope: "supplied_snapshots_only",
  sourceRows: 3218,
  persistedRows: 3218,
  matchingRows: 3218,
  pendingRows: 0,
  orphanRows: 0,
  differingRows: 0,
  matchingUnknownBalances: 1,
  differences: {
    account: 0, bankDate: 0, amountCents: 0,
    balanceAfterCents: 0, sourceFingerprint: 0,
  },
  accounts: [{
    accountLabel: "Cuenta 1",
    sourceRows: 3218, persistedRows: 3218, matchingRows: 3218,
    pendingRows: 0, orphanRows: 0, differingRows: 0,
  }],
  readConsistency: "sequential_non_atomic",
} as const;

async function mockSource(page: Page) {
  await page.route("**/api/source/google/status", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      configured: true, authMode: "service-account",
      connection: {
        connected: true,
        accountEmail: "reader@example.invalid",
        sourceFileName: "Movimientos bancarios - fuente",
        lastVerifiedAt: null,
        readonly: true, managed: true,
      },
    }),
  }));
  await page.route("**/api/health/source-runtime", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "ok", compatible: true }),
  }));
  await page.route("**/api/source/google/sync", route => route.fulfill({
    status: route.request().method() === "GET" ? 200 : 503,
    contentType: "application/json",
    body: JSON.stringify(route.request().method() === "GET" ? {
      run: {
        id: "synthetic-old-run", status: "success", sourceRevision: "drive-version:112",
        startedAt: "2026-01-01T08:00:00Z",
        finishedAt: "2026-01-01T08:00:01Z",
        rowsSeen: 3188, rowsInserted: 0, rowsRevised: 0,
        rowsSkipped: 3188, rowsFailed: 0, rowsMissing: 0,
        duplicatesDetected: 0, warningsCount: 0,
      },
      cursors: [{ sourceSheetId: "725351515" }, { sourceSheetId: "2504001" }],
    } : { error: "sync_forbidden_in_synthetic_test" }),
  }));
}

test("REC-SYNC-634 · la cobertura independiente no hereda el historial antiguo ni importa", async ({ page }) => {
  await mockSource(page);
  let reads = 0;
  let writes = 0;
  await page.route("**/api/source/google/postflight", route => {
    if (route.request().method() !== "GET") writes += 1;
    reads += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(verifiedCoverage) });
  });
  await page.goto("/configuration/source");
  await expect(page.getByText(/Este historial no incluye posibles altas protegidas/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Comparación de movimientos guardados" })).toHaveCount(0);
  const button = page.getByRole("button", { name: "Comparar movimientos guardados" });
  await expect(button).toBeEnabled();
  await button.click();
  const report = page.getByRole("region", { name: "Comparación de movimientos guardados" });
  await expect(report.getByRole("heading", { name: "Todos los movimientos comprobados coinciden" })).toBeVisible();
  await expect(report.getByText("3.218")).toHaveCount(3);
  await expect(report.getByText("1 saldo no facilitado por el banco", { exact: false })).toBeVisible();
  expect(reads).toBe(1);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Comprobar estado" }).click();
  await expect(report).toHaveCount(0);
});

test("REC-SYNC-634 · un HTTP 200 contradictorio jamás acredita cobertura completa", async ({ page }) => {
  await mockSource(page);
  await page.route("**/api/source/google/postflight", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      ...verifiedCoverage, sourceRows: 3218, persistedRows: 3188,
      matchingRows: 3188, pendingRows: 30,
      status: "verified",
    }),
  }));
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Comparar movimientos guardados" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "datos incompletos" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comparación de movimientos guardados" })).toHaveCount(0);
});

test("REC-SYNC-634 · fallo de acceso borra la prueba previa y evita falsas coincidencias", async ({ page }) => {
  await mockSource(page);
  let authorized = true;
  await page.route("**/api/source/google/postflight", route => route.fulfill({
    status: authorized ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(authorized ? verifiedCoverage : { error: "authentication_required" }),
  }));
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Comparar movimientos guardados" }).click();
  await expect(page.getByRole("region", { name: "Comparación de movimientos guardados" })).toBeVisible();
  authorized = false;
  await page.getByRole("button", { name: "Comparar movimientos guardados" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "sesión ha caducado" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comparación de movimientos guardados" })).toHaveCount(0);
});
