import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";

const branch = "commercial-readiness/cr006-zero-cost-beta";
const layout = readFileSync("app/layout.tsx", "utf8");
const entry = readFileSync("app/beta/route.ts", "utf8");
const runtime = readFileSync("public/cr006-beta-runtime.js", "utf8");
const compat = readFileSync("public/cr006-beta-compat.js", "utf8");

function buildSandbox() {
  const storage = new Map<string, string>();
  let originalFetchCalls = 0;
  const windowObject: Record<string, unknown> = {
    location: {
      href: "https://preview.example.test/?cr006_beta_reset=1",
      pathname: "/",
      hash: "",
      origin: "https://preview.example.test",
    },
    fetch: async () => {
      originalFetchCalls += 1;
      return new Response("original", { status: 599 });
    },
  };
  const context = {
    window: windowObject,
    document: {
      cookie: "financial_app_cr006_beta=1",
      readyState: "loading",
      addEventListener: () => undefined,
      getElementById: () => null,
      body: { prepend: () => undefined },
      createElement: () => ({
        id: "",
        textContent: "",
        style: {},
        setAttribute: () => undefined,
      }),
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    history: { replaceState: () => undefined },
    URL,
    URLSearchParams,
    Response,
    Request,
    Headers,
    crypto,
    console,
    Map,
    Set,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    RegExp,
  };
  return { context, windowObject, getOriginalFetchCalls: () => originalFetchCalls };
}

test("CR-006 · el modo beta solo existe en el Preview exacto y nunca en Production", () => {
  expect(layout).toContain('process.env.VERCEL_ENV === "preview"');
  expect(layout).toContain(`process.env.VERCEL_GIT_COMMIT_REF === CR006_BETA_BRANCH`);
  expect(layout).toContain('src="/cr006-beta-runtime.js"');
  expect(layout).toContain('src="/cr006-beta-compat.js"');
  expect(layout).toContain('enabled={process.env.VERCEL_ENV === "production"}');

  expect(entry).toContain(`const CR006_BETA_BRANCH = "${branch}"`);
  expect(entry).toContain('process.env.VERCEL_ENV === "preview"');
  expect(entry).toContain('process.env.VERCEL_GIT_COMMIT_REF === CR006_BETA_BRANCH');
  expect(entry).toContain('response.cookies.set(CR006_BETA_COOKIE, "1"');
  expect(entry).toContain('maxAge: 23 * 60 * 60');
});

test("CR-006 · runtime y compatibilidad compilan como JavaScript", () => {
  expect(() => new vm.Script(runtime, { filename: "cr006-beta-runtime.js" })).not.toThrow();
  expect(() => new vm.Script(compat, { filename: "cr006-beta-compat.js" })).not.toThrow();
});

test("CR-006 · la beta falla cerrada y no toca persistencia externa", async () => {
  const { context, windowObject, getOriginalFetchCalls } = buildSandbox();
  vm.runInNewContext(runtime, context, { filename: "cr006-beta-runtime.js" });
  vm.runInNewContext(compat, context, { filename: "cr006-beta-compat.js" });

  const betaFetch = windowObject.fetch as typeof fetch;

  const financialResponse = await betaFetch("https://preview.example.test/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(financialResponse.status).toBe(200);
  const financial = await financialResponse.json();
  expect(financial.principles.bankSource).toBe("read_only");
  expect(financial.balances.accounts[0].id).toBeTruthy();
  expect(Array.isArray(financial.monthly.rows)).toBe(true);

  const budgetResponse = await betaFetch("https://preview.example.test/api/budgets?month=2026-09");
  expect(budgetResponse.status).toBe(200);
  const budget = await budgetResponse.json();
  expect(budget.total.effectiveAmountCents).toBeGreaterThan(0);
  expect(budget.principles.bankSource).toBe("read_only");

  const unknown = await betaFetch("https://preview.example.test/api/never-fall-through");
  expect(unknown.status).toBe(503);
  await expect(unknown.json()).resolves.toMatchObject({ error: "cr006_beta_endpoint_not_implemented" });

  const supabase = await betaFetch("https://example.supabase.co/rest/v1/private");
  expect(supabase.status).toBe(451);
  await expect(supabase.json()).resolves.toMatchObject({ error: "cr006_beta_external_persistence_blocked" });

  const google = await betaFetch("https://www.googleapis.com/drive/v3/files");
  expect(google.status).toBe(451);
  expect(getOriginalFetchCalls()).toBe(0);
});

test("CR-006 · el dataset es inequívocamente ficticio y cubre los flujos humanos previstos", () => {
  for (const marker of [
    "Cuenta corriente Demo",
    "Banco Demo",
    "Carrefour Demo",
    "FACTURA DEMO",
    "beta@financial-app.test",
    'dataset: "fictitious"',
    'externalPersistence: "blocked"',
  ]) {
    expect(runtime).toContain(marker);
  }

  for (const route of [
    "/api/financial",
    "/api/analysis",
    "/api/transactions",
    "/api/configuration",
    "/api/merchants",
    "/api/rules",
    "/api/budgets",
    "/api/recurrences",
    "/api/forecast",
    "/api/documents",
    "/api/documents/ocr",
    "/api/source/google/status",
    "/api/source/google/sync",
  ]) {
    expect(runtime).toContain(route);
  }

  expect(runtime).not.toContain("btzukbfesxdratqnxuoj");
  expect(runtime).not.toContain("Openbank");
  expect(runtime).not.toContain("Alberto");
  expect(runtime).toContain("cr006_beta_endpoint_not_implemented");
  expect(runtime).toContain("cr006_beta_external_persistence_blocked");
});
