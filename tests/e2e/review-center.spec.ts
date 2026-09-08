import { expect, test, type Page, type Route } from "@playwright/test";

const json = (route: Route, body: unknown) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function mockReviewSources(page: Page) {
  const methods: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/build") {
      await route.continue();
      return;
    }

    methods.push(request.method());

    if (url.pathname === "/api/transactions" && url.searchParams.get("reviewState") === "needs_review") {
      return json(route, { rows: [], totalCount: 2, hasMore: false, nextCursor: null });
    }
    if (url.pathname === "/api/transactions" && url.searchParams.get("duplicateState") === "suspected") {
      return json(route, { rows: [], totalCount: 1, hasMore: false, nextCursor: null });
    }
    if (url.pathname === "/api/recurrences") {
      return json(route, {
        candidateCount: 3,
        candidates: [
          { candidateKey: "a".repeat(32), existingStatus: null },
          { candidateKey: "b".repeat(32), existingStatus: null },
          { candidateKey: "c".repeat(32), existingStatus: "active" },
        ],
      });
    }
    if (url.pathname === "/api/documents") {
      return json(route, { items: [], total: 3, limit: 1, offset: 0 });
    }
    if (url.pathname === "/api/budgets") {
      return json(route, {
        total: { status: "over" },
        categories: [
          { categoryId: "1", categoryName: "Alimentación", status: "over" },
          { categoryId: "2", categoryName: "Ocio", status: "over" },
          { categoryId: "3", categoryName: "Hogar", status: "on_track" },
        ],
      });
    }
    if (url.pathname === "/api/forecast") {
      return json(route, {
        summary: { plannedItems: 2 },
        items: [
          { id: "1", status: "planned", confidence: "low" },
          { id: "2", status: "planned", confidence: "high" },
        ],
      });
    }
    if (url.pathname === "/api/source/google/status") {
      return json(route, { configured: true, connection: { connected: true, readonly: true } });
    }
    if (url.pathname === "/api/source/google/sync") {
      return json(route, {
        run: { status: "failed", rowsFailed: 1, warningsCount: 2, errorCode: "source_test_failure" },
        cursors: [],
      });
    }

    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  return methods;
}

test("E1 · Para revisar agrega referencias vivas sin crear una segunda fuente de verdad", async ({ page }) => {
  const methods = await mockReviewSources(page);
  await page.goto("/review");

  await expect(page.getByRole("heading", { name: "Para revisar", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Para revisar", exact: true }))
    .toHaveAttribute("aria-current", "page");

  const expected = [
    ["Movimientos por revisar", "2", "/transactions?reviewState=needs_review"],
    ["Posibles duplicados", "1", "/transactions?duplicateState=suspected"],
    ["Recurrentes sin decidir", "2", "/recurrences"],
    ["Documentos pendientes", "3", "/documents"],
    ["Presupuestos excedidos", "2", "/budgets"],
    ["Previsiones con baja confianza", "1", "/forecast"],
    ["Sincronización bancaria", "1", "/configuration/source"],
  ] as const;

  for (const [name, count, href] of expected) {
    const region = page.getByRole("article", { name });
    await expect(region).toContainText(count);
    await expect(region.getByRole("link")).toHaveAttribute("href", href);
  }

  expect(methods.length).toBeGreaterThanOrEqual(8);
  expect(methods.every((method) => method === "GET")).toBe(true);
});

test("E1 · Para revisar mantiene navegación usable y cero overflow en móvil", async ({ page }) => {
  await mockReviewSources(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/review");

  const navLink = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Para revisar", exact: true });
  const box = await navLink.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
