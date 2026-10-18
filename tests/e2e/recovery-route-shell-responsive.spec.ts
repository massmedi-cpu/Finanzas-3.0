import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { configurationRoutes, navigationItems } from "../../app/navigation-items";

// Shell-only smoke: isolates live APIs, never certifies banking data or backend behavior.
// These legacy deep links redirect to an existing editor tab. They are not
// additional functional product destinations, but must exist and stay tested.
const compatibilityRedirects = new Map([
  ["/configuration/accounts", "/configuration?tab=accounts"],
  ["/configuration/categories", "/configuration?tab=categories"],
]);
// The canonical product retains 21 authenticated destinations plus /login.
// Compatibility aliases are certified separately as redirects.
const destinations = [
  ...navigationItems.map((item) => ({ path: item.href, label: item.label })),
  ...configurationRoutes.map((path) => ({ path, label: "Configuración" })),
];
if (destinations.length !== 21) throw new Error("Expected 21 authenticated product routes");

test("REC-VIS-004 · manifiesto de páginas reales coincide con los 21 destinos certificados", () => {
  const root = join(process.cwd(), "app");
  const pages: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "api") continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name === "page.tsx") {
        const relativeRoute = relative(root, directory).split(sep).join("/");
        pages.push(relativeRoute ? `/${relativeRoute}` : "/");
      }
    }
  };
  visit(root);
  const actual = pages.filter((path) => path !== "/login" && !compatibilityRedirects.has(path)).sort();
  const expected = destinations.map((route) => route.path).sort();
  expect(actual, "Every canonical authenticated Next.js page must belong to the smoke matrix").toEqual(expected);
  for (const [alias, destination] of compatibilityRedirects) {
    expect(pages, `Compatibility route ${alias} must have a page`).toContain(alias);
    const redirectSource = readFileSync(join(root, alias.slice(1), "page.tsx"), "utf8");
    expect(redirectSource, `Compatibility route ${alias} must redirect instead of duplicating an editor`)
      .toContain(`redirect("${destination}")`);
  }
});

test.describe("REC-VIS-004 · shell de navegación responsive", () => {
  for (const width of [390, 1440]) for (const colorScheme of ["light", "dark"] as const) {
    test(`${destinations.length} destinos a ${width}px y tema ${colorScheme}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium-desktop", "Matriz completa recorrida en proyecto desktop");
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "isolated_visual_smoke" }) });
      });
      for (const { path, label } of destinations) {
        await test.step(`${path}: navegación, tema y anchura`, async () => {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
          await expect(page.locator("#main-content")).toBeAttached();
          if (width < 600) {
            await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeVisible();
          } else {
            const nav = page.getByRole("navigation", { name: "Navegación principal" });
            await expect(nav).toBeVisible();
            await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
          }
          const geometry = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            page: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          expect(Math.max(geometry.page, geometry.body), `${path} ${width}px ${colorScheme} must not overflow`)
            .toBeLessThanOrEqual(geometry.width + 1);
        });
      }
    });
  }
});


import {
  parseHomeBankFreshness,
  resolveHomeBankCoverage,
} from "../../src/application/dashboard/home-bank-coverage";

const completeHomeSync = {
  status: "success", startedAt: "2026-10-11T09:00:00Z",
  finishedAt: "2026-10-11T09:05:00Z",
  rowsSeen: 5, rowsFailed: 0, rowsMissing: 0,
  duplicatesDetected: 0, warningsCount: 0,
};

test("REC-HOME-020 · fechas retenidas no convierten en cero bancario una fuente no disponible", () => {
  const retention = parseHomeBankFreshness({
    available: false, earliestMovementDate: "2026-10-01",
    latestMovementDate: "2026-10-11", sync: completeHomeSync,
  });
  expect(resolveHomeBankCoverage({
    dateFrom: "2026-10-01", dateTo: "2026-10-11", freshness: retention,
    activityLatestDate: "2026-10-11",
  }).state).toBe("unknown");

  expect(parseHomeBankFreshness({
    available: true, earliestMovementDate: "2026-02-30",
    latestMovementDate: "2026-10-11", sync: completeHomeSync,
  })).toBeNull();
  expect(resolveHomeBankCoverage({
    dateFrom: "2026-10-01", dateTo: "2026-10-11", freshness: null,
  }).state).toBe("unknown");
});

test("REC-HOME-021 · cobertura completa requiere inicio, final y sincronización verificables", () => {
  const range = { dateFrom: "2026-10-01", dateTo: "2026-10-11" };
  const full = parseHomeBankFreshness({
    available: true, earliestMovementDate: "2026-10-01",
    latestMovementDate: "2026-10-11", sync: completeHomeSync,
  });
  expect(resolveHomeBankCoverage({ ...range, freshness: full }).state).toBe("covered");
  expect(resolveHomeBankCoverage({
    ...range, freshness: full, activityLatestDate: "2026-10-10",
  }).state).toBe("unknown");
  const incomplete = parseHomeBankFreshness({
    available: true, earliestMovementDate: null,
    latestMovementDate: "2026-10-11", sync: completeHomeSync,
  });
  expect(resolveHomeBankCoverage({ ...range, freshness: incomplete }).state).toBe("partial");
  const withoutSync = parseHomeBankFreshness({
    available: true, earliestMovementDate: "2026-10-01",
    latestMovementDate: "2026-10-11", sync: null,
  });
  expect(resolveHomeBankCoverage({ ...range, freshness: withoutSync }).state).toBe("partial");
});

for (const bankingState of ["available", "unavailable", "conflict"] as const) {
  const verifiedBank = bankingState === "available";
  const bankUnavailable = bankingState === "unavailable";
  test(`${bankingState === "conflict" ? "REC-HOME-023" : "REC-HOME-022"} · Inicio ${bankingState === "available" ? "muestra importes con fuente verificada" : bankingState === "conflict" ? "bloquea importes con fechas bancarias discrepantes" : "oculta importes con fuente no disponible"}`, async ({ page }) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const monthStart = today.slice(0, 7) + "-01";
    const previousDate = new Date(`${today}T12:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const lastActivityDate = bankingState === "conflict"
      ? previousDate.toISOString().slice(0, 10) : today;
    // Only the verified-source browser case uses a fresh completed check.
    // The last bank movement is a different timestamp and must not be rewritten
    // to manufacture recency; keep all genuine stale-source scenarios elsewhere.
    const recentSync = {
      ...completeHomeSync,
      startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      finishedAt: new Date().toISOString(),
    };
    const financial = {
      period: {
        dateFrom: monthStart, dateTo: today, incomeCents: 5000,
        expenseCents: 15000, operatingNetCents: -10000,
        savingsCents: -10000, savingsRateBps: null,
        quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
      },
      balances: { asOfDate: today, activeBalanceCents: 0, accounts: [] },
    };
    const monthly = {
      dateFrom: monthStart, dateTo: today,
      rows: [{ monthStart, incomeCents: 5000, expenseCents: 15000, operatingNetCents: -10000 }],
    };
    const transactions = { totalCount: 1, rows: [{
      id: "aa000000-0000-4000-8000-000000000001",
      bankDate: lastActivityDate, amountCents: 5000,
      account: { id: "aa000000-0000-4000-8000-000000000002", name: "Cuenta sintética" },
      concept: { effective: "Movimiento de prueba" },
      category: { effectiveId: null, effectiveName: null },
      kind: { effective: "expense" }, duplicateState: "none", excludedFromAnalytics: false,
    }] };
    await page.route("**/api/**", route => route.fulfill({
      status: 503, json: { error: "synthetic_backend_isolated" },
    }));
    await page.route("**/api/source/google/sync", route => route.fulfill({ json: {
      run: {
        id: "aa000000-0000-4000-8000-000000000003",
        ...recentSync,
        rowsInserted: 5, rowsRevised: 0, rowsSkipped: 0,
        rowsMissing: 0, rowsFailed: 0, duplicatesDetected: 0,
        warningsCount: 0, errorCode: null, errorMessage: null,
      },
      cursors: [],
    } }));
    await page.route("**/api/analysis/source-freshness", route => route.fulfill({
      json: {
        available: !bankUnavailable,
        earliestMovementDate: monthStart, latestMovementDate: today,
        sync: recentSync,
      },
    }));
    await page.route("**/api/dashboard?*", route => {
      const scope = new URL(route.request().url()).searchParams.get("scope");
      const data = {
        financial: scope === "critical" ? financial : null,
        monthly: scope === "secondary" ? monthly : null, budgets: null, forecast: null,
        transactions: scope === "activity" ? transactions : null,
      };
      return route.fulfill({ json: {
        contractVersion: 1, scope, asOfDate: today,
        dataThroughDate: scope === "activity" ? lastActivityDate : null,
        generatedAt: new Date().toISOString(),
        requestedSources: scope === "critical" ? ["financial"] : scope === "activity" ? ["transactions"] : ["monthly", "budgets", "forecast"],
        failedSources: scope === "secondary" ? ["budgets", "forecast"] : [],
        data,
      } });
    });
    await page.goto("/");
    const card = page.locator('section[aria-label="Resumen financiero principal"] article').nth(1);
    const bankHealth = page.getByRole("region", { name: "Estado de los datos bancarios" });
    const evolution = page.getByRole("group", { name: /Ingresos y gastos por mes/ });
    if (verifiedBank) {
      await expect(card.locator("strong")).toContainText("-100,00");
      await expect(bankHealth).toContainText("Datos bancarios actualizados");
      await expect(page.getByText("El balance del mes está en negativo")).toBeVisible();
      await expect(evolution.locator('button[data-month-coverage="covered"]')).toHaveCount(1);
      await expect(page.getByTestId("financial-bar-scale-reference")).toContainText("Escala máxima");
    } else {
      await expect(card).toContainText(bankUnavailable
        ? "Fuente bancaria no disponible" : "Fechas bancarias discordantes");
      await expect(card.locator("strong")).toHaveText("—");
      await expect(card).not.toContainText("-100,00");
      await expect(bankHealth).toContainText(bankUnavailable
        ? "Fuente bancaria no disponible" : "Fechas bancarias discordantes");
      await expect(bankHealth).not.toContainText("Datos bancarios actualizados");
      await expect(page.getByText("El balance del mes está en negativo")).toHaveCount(0);
      await expect(evolution.locator('button[data-month-coverage="unknown"]')).toHaveCount(1);
      await expect(evolution.getByRole("button", { name: /sin cobertura bancaria confirmada/ })).toHaveCount(1);
      // The largest unverified monetary figure is not a chart scale.
      await expect(page.getByTestId("financial-bar-scale-reference")).toHaveText("Escala sin cobertura bancaria observada");
      if (!bankUnavailable) {
        await expect(page.getByText("La fecha bancaria no coincide con los movimientos")).toBeVisible();
        await expect(page.getByRole("region", { name: "Resumen inteligente" })).not.toContainText("Datos hasta");
      }
    }
  });
}
