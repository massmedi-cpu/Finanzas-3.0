import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TRANSACTION_ID = "60000000-0000-4000-8000-000000000125";
const ACCOUNT_ID = "10000000-0000-4000-8000-000000000125";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

const migration = source("supabase/migrations/20260927185432_sign_mismatch_transaction_review_10_0_25.sql");
const gateway = source("supabase/functions/financial-app-db-gateway/transaction-query.ts");
const route = source("app/api/transactions/route.ts");
const transactions = source("app/transactions/transactions-client.tsx");
const home = source("app/inicio-overview.tsx");

test("10.0.25 mantiene una sola fuente de verdad para detectar signos incoherentes", () => {
  expect(migration).toContain("from financial_app.financial_transaction_facts(p_date_from,p_date_to,p_account_id) f");
  expect(migration).toContain("and (not coalesce(p_sign_mismatch,false) or e.sign_mismatch)");
  expect(migration).toContain("'signMismatch',v.sign_mismatch");
  expect(migration).not.toContain("effective_transaction_kind(");
  expect(migration).toContain("from public,anon,authenticated");
  expect(migration).toContain("to service_role");
});

test("10.0.25 transporta el filtro desde Inicio hasta el RPC paginado", () => {
  expect(home).toContain('href: "/transactions?signMismatch=true"');
  expect(transactions).toContain('["signMismatch", "signMismatch"]');
  expect(transactions).toContain('signMismatch: signMismatch === "true" ? "true" : ""');
  expect(route).toContain('const signMismatch = optionalBoolean(searchParams, "signMismatch")');
  expect(route).toContain("signMismatch,");
  expect(gateway).toContain('booleanValue(payload.signMismatch, "transaction_sign_mismatch")');
  expect(gateway).toContain("${signMismatch}");
});

test("10.0.25 abre Movimientos ya filtrado, conserva la URL y explica la anomalía", async ({ page }) => {
  const seen: URL[] = [];
  await page.route("**/api/transactions**", async (requestRoute) => {
    const url = new URL(requestRoute.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await requestRoute.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accounts: [], categories: [], merchants: [] }),
      });
      return;
    }

    seen.push(url);
    const filtered = url.searchParams.get("signMismatch") === "true";
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: filtered ? [{
          id: TRANSACTION_ID,
          bankDate: "2026-09-27",
          amountCents: -125000,
          balanceAfterCents: 300000,
          account: { id: ACCOUNT_ID, name: "Cuenta principal" },
          concept: { original: "NÓMINA", processed: "NÓMINA", effective: "NÓMINA" },
          merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
          category: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
          kind: { original: "income", effective: "income" },
          reviewState: { original: "pending", effective: "pending" },
          duplicateState: "none",
          signMismatch: true,
          transferPairId: null,
          excludedFromAnalytics: false,
          userNote: null,
          hasUserOverride: false,
          overriddenFields: [],
          source: {
            sourceRecordId: "70000000-0000-4000-8000-000000000125",
            sourceRowIdentity: "source::sheet::ROW-125",
            sourceFileId: "source-file",
            sourceSheetId: "sheet-1",
            sourceRowKey: "ROW-125",
            sourceFingerprint: "a".repeat(64),
            importedAt: "2026-09-27T08:00:00.000Z",
          },
        }] : [],
        totalCount: filtered ? 1 : 0,
        hasMore: false,
        nextCursor: null,
      }),
    });
  });

  await page.goto("/transactions?signMismatch=true");
  await expect(page.getByRole("combobox", { name: "Calidad" })).toHaveValue("true");
  await expect.poll(() => seen.some((url) => url.searchParams.get("signMismatch") === "true")).toBe(true);
  await expect(page.locator("tbody").getByText("Signo incoherente", { exact: true })).toBeVisible();

  const trace = page.locator("tbody details");
  await trace.locator("summary").click();
  await expect(trace).toHaveAttribute("open", "");
  await expect(trace.getByText("El tipo financiero y el signo bancario no coinciden. El importe original no se ha modificado.")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/signMismatch=true/);
  await expect(page.getByRole("combobox", { name: "Calidad" })).toHaveValue("true");
});

test("10.0.25 distingue un resultado limpio de un fallo de carga", async ({ page }) => {
  await page.route("**/api/transactions**", async (requestRoute) => {
    const url = new URL(requestRoute.request().url());
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("mode") === "facets"
        ? { accounts: [], categories: [], merchants: [] }
        : { rows: [], totalCount: 0, hasMore: false, nextCursor: null }),
    });
  });

  await page.goto("/transactions?signMismatch=true");
  await expect(page.getByText("No hay movimientos con el signo incoherente.", { exact: true })).toBeVisible();
  // Next.js mantiene fuera de <main> su propio anunciador de ruta con role=alert.
  // La ausencia que importa aquí es la del error funcional de Movimientos.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
