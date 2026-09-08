import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const forecastItemId = "81000000-0000-4000-8000-000000000181";

const snapshot = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-09", dateTo: "2026-12-07", accountId: null },
  summary: {
    openingBalanceCents: 18884599,
    projectedIncomeCents: 150000,
    projectedExpenseCents: 7250,
    projectedNetCents: 142750,
    projectedClosingBalanceCents: 19027349,
    plannedItems: 1,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: forecastItemId,
      date: "2026-09-15",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Seguro mensual",
      amountCents: -7250,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -7250,
      projectedBalanceAfterCents: 18877349,
      actual: null,
    },
  ],
  budgetContext: [
    { month: "2026-09", budgetCents: 128633, actualExpenseCents: 6611, remainingCents: 122022, status: "on_track" },
  ],
  balanceContext: {
    quality: { accounts: 2, integrityDeltaAccounts: 0, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
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

async function mockForecast(page: Page) {
  await page.route("**/api/forecast*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
}

function normalizeCss(css: string) {
  return css.replace(/\s+/g, " ").toLowerCase();
}

test("D1 · Previsión abandona la paleta paralela y consume el contrato visual semántico común", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato visual se mide una vez por run");

  const forecastCss = normalizeCss(readFileSync(join(process.cwd(), "app/forecast/forecast.module.css"), "utf8"));
  for (const token of [
    "var(--color-bg)",
    "var(--color-surface)",
    "var(--color-border)",
    "var(--color-text)",
    "var(--color-text-secondary)",
    "var(--color-primary)",
    "var(--color-success)",
    "var(--color-danger)",
    "var(--focus-ring)",
  ]) {
    expect(forecastCss, `Previsión debe consumir ${token}`).toContain(token);
  }

  for (const legacyColor of ["#f5f5f2", "#171715", "#8a6728", "#9a7634", "#987536", "#1d1c19", "#3a352d"]) {
    expect(forecastCss, `la paleta paralela ${legacyColor} debe desaparecer`).not.toContain(legacyColor);
  }

  await mockForecast(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/forecast");
  await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();

  const visual = await page.locator("main").evaluate((main) => {
    const root = getComputedStyle(document.documentElement);
    const resolveColor = (name: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const panel = document.querySelector("aside section");
    const mainStyle = getComputedStyle(main);
    const panelStyle = panel ? getComputedStyle(panel) : null;
    return {
      rootBackground: resolveColor("--color-bg"),
      rootText: resolveColor("--color-text"),
      rootSurface: root.getPropertyValue("--color-surface").trim(),
      pageBackground: mainStyle.backgroundColor,
      pageText: mainStyle.color,
      panelBackground: panelStyle?.backgroundColor ?? "",
    };
  });

  expect(visual.pageBackground).toBe(visual.rootBackground);
  expect(visual.pageText).toBe(visual.rootText);
  expect(visual.rootSurface).not.toBe("");
  expect(visual.panelBackground).not.toBe("rgba(255, 255, 255, 0.9)");
});

test("D1 · la migración visual no degrada reflow ni touch de Previsión", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz D1 se ejecuta una vez por run");
  await mockForecast(page);

  for (const width of [360, 430, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/forecast");
    await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();

    const metrics = await page.locator("main").evaluate((main) => {
      const undersized = Array.from(main.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
        })
        .map((element) => `${element.tagName.toLowerCase()}:${Math.round(element.getBoundingClientRect().height)}px`);
      return {
        overflow: main.scrollWidth - main.clientWidth,
        undersized,
      };
    });

    expect(metrics.overflow, `${width}px no debe introducir overflow horizontal`).toBeLessThanOrEqual(1);
    expect(metrics.undersized, `${width}px debe conservar targets >=44 px`).toEqual([]);
  }
});
