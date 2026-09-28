import { expect, test, type Page, type Route } from "@playwright/test";

type SourcePayload = {
  available: boolean;
  latestMovementDate: string | null;
  sync: null | {
    status: "success" | "partial" | "failed" | "started";
    finishedAt: string | null;
    startedAt: string | null;
    rowsSeen: number | null;
    rowsFailed: number | null;
    rowsMissing: number | null;
    duplicatesDetected: number | null;
    warningsCount: number | null;
  };
};

const successPayload: SourcePayload = {
  available: true,
  latestMovementDate: "2026-09-28",
  sync: {
    status: "success",
    finishedAt: "2026-09-28T14:00:00.000Z",
    startedAt: "2026-09-28T13:59:00.000Z",
    rowsSeen: 1248,
    rowsFailed: 0,
    rowsMissing: 0,
    duplicatesDetected: 0,
    warningsCount: 0,
  },
};

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sourceRegion(page: Page) {
  return page.getByRole("region", { name: "Estado de la fuente bancaria" });
}

async function isolateData(page: Page, sourceHandler: (route: Route) => Promise<void>) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname === "/api/analysis/source-freshness") return sourceHandler(route);
    return fulfillJson(route, 503, { error: "source_trust_cache_data_isolated" });
  });
}

test("10.0.31 · conserva una comprobación válida al saltar entre módulos protegidos", async ({ page }) => {
  let sourceRequests = 0;
  await isolateData(page, async (route) => {
    sourceRequests += 1;
    await fulfillJson(route, 200, successPayload);
  });

  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto("/transactions");
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente comprobada");
  expect(sourceRequests).toBe(1);

  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Cuentas" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente comprobada");
  expect(sourceRequests).toBe(1);

  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Previsión" }).click();
  await expect(page).toHaveURL(/\/forecast$/);
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente comprobada");
  expect(sourceRequests).toBe(1);
});

test("10.0.31 · visitar Fuente bancaria invalida la comprobación anterior", async ({ page }) => {
  let sourceRequests = 0;
  const incidentPayload: SourcePayload = {
    ...successPayload,
    sync: { ...successPayload.sync!, status: "failed", rowsFailed: 1, warningsCount: 1 },
  };
  await isolateData(page, async (route) => {
    sourceRequests += 1;
    await fulfillJson(route, 200, incidentPayload);
  });

  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto("/transactions");
  const region = sourceRegion(page);
  await expect(region.getByRole("status")).toContainText("Fuente con incidencias");
  expect(sourceRequests).toBe(1);

  await region.getByRole("link", { name: "Revisar fuente" }).click();
  await expect(page).toHaveURL(/\/configuration\/source$/);
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Cuentas" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente con incidencias");
  expect(sourceRequests).toBe(2);
});

test("10.0.31 · un fallo no se cachea y el siguiente módulo vuelve a comprobar", async ({ page }) => {
  let sourceRequests = 0;
  let healthy = false;
  await isolateData(page, async (route) => {
    sourceRequests += 1;
    if (!healthy) return fulfillJson(route, 503, { error: "temporary" });
    return fulfillJson(route, 200, successPayload);
  });

  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto("/transactions");
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente no comprobable");
  expect(sourceRequests).toBe(1);

  healthy = true;
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Cuentas" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente comprobada");
  expect(sourceRequests).toBe(2);
});
