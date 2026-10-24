import { expect, test, type Page, type Route } from "@playwright/test";

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-11",
    incomeCents: 150000,
    expenseCents: 70000,
    operatingNetCents: 80000,
    savingsCents: 80000,
    savingsRateBps: 5333,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-11",
    activeBalanceCents: 30000,
    accounts: [
      {
        id: "a",
        name: "Cuenta principal",
        type: "checking",
        lifecycle: "active",
        balanceCents: 30000,
        explicitBalanceDate: "2026-09-11",
      },
    ],
  },
};

const monthly = {
  dateFrom: "2026-01-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2026-08-01", incomeCents: 100000, expenseCents: 40000, operatingNetCents: 60000 },
    { monthStart: "2026-09-01", incomeCents: 150000, expenseCents: 70000, operatingNetCents: 80000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: {
    categoryId: null,
    categoryName: null,
    effectiveAmountCents: 100000,
    actualExpenseCents: 60000,
    remainingCents: 40000,
    progressBps: 6000,
    status: "on_track",
  },
  categories: [],
};

const forecast = {
  summary: {
    projectedIncomeCents: 0,
    projectedExpenseCents: 0,
    projectedNetCents: 0,
    projectedClosingBalanceCents: 30000,
    plannedItems: 0,
  },
  items: [],
};

const transactions = { rows: [], totalCount: 0 };

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockDashboard(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+02:00"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/analysis/source-freshness") {
      await fulfillJson(route, {
        available: true,
        earliestMovementDate: "2026-01-01",
        latestMovementDate: "2026-09-11",
        sync: {
          status: "success", startedAt: "2026-09-11T08:00:00Z",
          finishedAt: "2026-09-11T08:05:00Z",
          rowsSeen: 100, rowsFailed: 0, rowsMissing: 0,
          duplicatesDetected: 0, warningsCount: 0,
        },
      });
      return;
    }

    if (url.pathname === "/api/source/google/sync") {
      await fulfillJson(route, { run: null });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const scope = url.searchParams.get("scope");
      if (scope === "critical" || scope === "activity") {
        await fulfillJson(route, {
          contractVersion: 1,
          scope,
          asOfDate: "2026-09-11",
          dataThroughDate: scope === "activity" ? "2026-09-11" : null,
          generatedAt: "2026-09-11T12:00:00.000Z",
          requestedSources: scope === "critical" ? ["financial"] : ["transactions"],
          failedSources: [],
          data: {
            financial: scope === "critical" ? financial : null,
            monthly: null, budgets: null, forecast: null,
            transactions: scope === "activity" ? transactions : null,
          },
        });
        return;
      }
      if (scope === "primary") {
        await fulfillJson(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-11",
          dataThroughDate: null,
          generatedAt: "2026-09-11T12:00:00.000Z",
          requestedSources: ["financial", "transactions"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      if (scope === "secondary") {
        await fulfillJson(route, {
          contractVersion: 1,
          scope: "secondary",
          asOfDate: "2026-09-11",
          dataThroughDate: null,
          generatedAt: "2026-09-11T12:00:00.000Z",
          requestedSources: ["monthly", "budgets", "forecast"],
          failedSources: [],
          data: { financial: null, monthly, budgets, forecast, transactions: null },
        });
        return;
      }
    }

    await route.fallback();
  });
}

test("Premium · la gráfica de Inicio expone valores exactos mediante foco y tap sin depender de hover", async ({ page }) => {
  await mockDashboard(page);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/");

  const chart = page.getByRole("group", { name: /Ingresos y gastos por mes/i });
  await expect(chart).toBeVisible();

  const september = chart.getByRole("button", {
    name: /ingresos 1\.500,00.*gastos 700,00.*balance neto 800,00/i,
  });
  await expect(september).toBeVisible();
  await expect(september).toHaveAccessibleName(/mes parcial/i);

  await september.focus();
  await expect(september).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: /Ingresos 1\.500,00/ })).toContainText(
    /Ingresos 1\.500,00.*Gastos 700,00.*Balance 800,00/i,
  );

  const august = chart.getByRole("button", {
    name: /ingresos 1\.000,00.*gastos 400,00.*balance neto 600,00/i,
  });
  await august.click();
  await expect(august).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: /Ingresos 1\.000,00/ })).toContainText(
    /Ingresos 1\.000,00.*Gastos 400,00.*Balance 600,00/i,
  );

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  ).toBe(true);
});


test("REC-UI-THEME-019 · Configuración mantiene profundidad y fondos diseñados en claro y oscuro", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503, contentType: "application/json",
      body: '{"error":"theme_visual_fixture_no_financial_data"}',
    });
  });
  await page.goto("/configuration");
  const hero = page.locator(".configuration-hero");
  await expect(hero).toBeVisible();

  // Compare both semantic CSS states in one browser task. A separate evaluate()
  // per theme can race VisualPreferencesProvider's hydration and overwrite data-theme.
  const computedThemes = await hero.evaluate((element) => {
    const root = document.documentElement;
    const originalTheme = root.getAttribute("data-theme");
    try {
      return (["dark", "light"] as const).map((theme) => {
        root.setAttribute("data-theme", theme);
        const style = getComputedStyle(element);
        return {
          theme,
          background: style.backgroundImage,
          shadow: style.boxShadow,
          textColor: style.color,
        };
      });
    } finally {
      if (originalTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", originalTheme);
    }
  });
  for (const computed of computedThemes) {
    expect(computed.background, computed.theme).toContain("linear-gradient(");
    expect(computed.shadow, computed.theme).not.toBe("none");
    expect(computed.textColor, computed.theme).not.toBe("transparent");
  }
  // A fixed dark elevation on every background makes the light theme muddy.
  expect(computedThemes[0].shadow).not.toBe(computedThemes[1].shadow);
});


test("REC-UI-CONTRAST-020 · alto contraste respeta fondo claro y oscuro sin texto desvaído", async ({ page }) => {
  await page.emulateMedia({ contrast: "more" });
  await page.goto("/configuration");
  for (const [theme, expectedMuted] of [
    ["light", "#30475f"],
    ["dark", "#cbd6e9"],
  ] as const) {
    const tokens = await page.locator("html").evaluate((element, selected) => {
      element.dataset.theme = selected;
      const css = getComputedStyle(element);
      return {
        muted: css.getPropertyValue("--color-text-muted").trim(),
        border: css.getPropertyValue("--color-border").trim(),
      };
    }, theme);
    expect(tokens.muted, theme).toBe(expectedMuted);
    expect(tokens.border, theme).not.toBe("");
  }
});
