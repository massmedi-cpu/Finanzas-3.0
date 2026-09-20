import { expect, test } from "@playwright/test";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000010";
const HOME_ID = "20000000-0000-4000-8000-000000000010";
const UTILITIES_ID = "20000000-0000-4000-8000-000000000011";
const INCOME_ID = "20000000-0000-4000-8000-000000000012";

const FIXTURE = {
  accounts: [
    {
      id: ACCOUNT_ID,
      name: "Cuenta principal",
      institution: "Banco prueba",
      type: "checking",
      openingBalanceCents: 123456,
      currency: "EUR",
      lifecycle: "active",
      sortOrder: 0,
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  categories: [
    {
      id: HOME_ID,
      name: "Hogar",
      kind: "expense",
      parentCategoryId: null,
      iconKey: "home",
      colorToken: "category.blue",
      lifecycle: "active",
      sortOrder: 0,
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
    {
      id: UTILITIES_ID,
      name: "Suministros",
      kind: "expense",
      parentCategoryId: HOME_ID,
      iconKey: "bolt",
      colorToken: "category.cyan",
      lifecycle: "active",
      sortOrder: 0,
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
    {
      id: INCOME_ID,
      name: "Nómina",
      kind: "income",
      parentCategoryId: null,
      iconKey: "briefcase",
      colorToken: "category.green",
      lifecycle: "active",
      sortOrder: 0,
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
};

test.describe("Configuración interactiva sin residuos", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/configuration", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) });
        return;
      }
      const body = route.request().postDataJSON();
      if (body.operation === "category.impact") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            impact: {
              transactionCount: 12,
              overrideCount: 0,
              ruleConditionCount: 0,
              ruleTargetCount: 0,
              merchantCount: 0,
              budgetCount: 0,
              activeRecurrenceCount: 0,
              futureForecastCount: 0,
              activeChildCount: body.id === HOME_ID ? 1 : 0,
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
  });

  test("respeta formato español y navegación de cuentas", async ({ page }) => {
    await page.goto("/configuration");
    await expect(page.getByRole("heading", { name: "Cuentas y categorías" })).toBeVisible();
    await expect(page.getByText("Cuenta principal")).toBeVisible();
    await expect(page.getByText(/1\.234,56/)).toBeVisible();

    await page.getByLabel("Nombre").fill("Cuenta inválida de prueba");
    await page.getByLabel(/Saldo inicial/).fill("1,234.56");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.locator(".config-message.error")).toContainText("formato español");
  });

  test("representa iconos reales, jerarquía y catálogo visual ampliado", async ({ page }) => {
    await page.goto("/configuration");
    await page.getByRole("button", { name: /Categorías/ }).click();

    await expect(page.locator('[data-category-icon="home"]')).toBeVisible();
    await expect(page.locator('[data-category-icon="bolt"]')).toBeVisible();
    const utilitiesCard = page.locator("article.category-card").filter({ hasText: "Suministros" });
    await expect(utilitiesCard).toHaveClass(/category-child/);
    await expect(utilitiesCard).toContainText("Subcategoría de Hogar");

    const iconSelect = page.getByLabel("Icono");
    const colorSelect = page.getByLabel("Color");
    expect(await iconSelect.locator("option").count()).toBeGreaterThanOrEqual(45);
    expect(await colorSelect.locator("option").count()).toBeGreaterThanOrEqual(18);
    expect(await page.locator(".color-palette button").count()).toBeGreaterThanOrEqual(18);
  });

  test("busca y filtra categorías sin perder la jerarquía", async ({ page }) => {
    await page.goto("/configuration");
    await page.getByRole("button", { name: /Categorías/ }).click();
    await page.getByPlaceholder("Buscar categoría…").fill("Suministros");
    const cards = page.locator("article.category-card");
    await expect(cards.getByRole("heading", { name: "Hogar", exact: true })).toBeVisible();
    await expect(cards.getByRole("heading", { name: "Suministros", exact: true })).toBeVisible();
    await expect(cards.getByRole("heading", { name: "Nómina", exact: true })).toHaveCount(0);

    await page.getByPlaceholder("Buscar categoría…").fill("");
    await page.getByRole("button", { name: "Ingresos" }).click();
    await expect(cards.getByRole("heading", { name: "Nómina", exact: true })).toBeVisible();
    await expect(cards.getByRole("heading", { name: "Hogar", exact: true })).toHaveCount(0);
  });

  test("no ofrece jerarquías, fusiones ni ciclos de vida imposibles", async ({ page }) => {
    await page.goto("/configuration");
    await page.getByRole("button", { name: /Categorías/ }).click();

    const homeCard = page.locator("article.entity-card").filter({ hasText: "Hogar" });
    await expect(homeCard.getByRole("button", { name: "Archivar Hogar" })).toBeDisabled();

    await page.getByRole("button", { name: "Editar Hogar" }).click();
    const typeSelect = page.locator("#category-form select").nth(0);
    expect(await typeSelect.locator('option[value="income"]').evaluate((option: HTMLOptionElement) => option.disabled)).toBe(true);
    expect(await typeSelect.locator('option[value="transfer"]').evaluate((option: HTMLOptionElement) => option.disabled)).toBe(true);

    const parentSelect = page.locator("#category-form select").nth(1);
    await expect(parentSelect.locator(`option[value="${UTILITIES_ID}"]`)).toHaveCount(0);

    const mergePanel = page.locator(".merge-panel");
    await mergePanel.getByLabel("Origen").selectOption(HOME_ID);
    const targetSelect = mergePanel.getByLabel("Destino");
    await expect(targetSelect.locator(`option[value="${UTILITIES_ID}"]`)).toHaveCount(0);
    await expect(targetSelect.locator(`option[value="${INCOME_ID}"]`)).toHaveCount(0);
  });

  test("exige revisión explícita antes de fusionar", async ({ page }) => {
    const targetId = "20000000-0000-4000-8000-000000000013";
    const merges: unknown[] = [];
    await page.route("**/api/configuration", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          ...FIXTURE,
          categories: [...FIXTURE.categories, { ...FIXTURE.categories[1], id: targetId, name: "Otros", parentCategoryId: null }],
        }) });
        return;
      }
      const body = route.request().postDataJSON();
      if (body.operation === "category.merge") merges.push(body);
      await route.fallback();
    });
    await page.goto("/configuration");
    await page.getByRole("button", { name: /Categorías/ }).click();
    const mergePanel = page.locator(".merge-panel");
    await mergePanel.getByLabel("Origen").selectOption(UTILITIES_ID);
    await expect(mergePanel.getByText(/12 movimientos/)).toBeVisible();
    await mergePanel.getByLabel("Destino").selectOption(targetId);
    await mergePanel.getByRole("button", { name: "Revisar fusión" }).click();
    await expect(mergePanel.getByRole("button", { name: "Confirmar fusión" })).toBeVisible();
    expect(merges).toEqual([]);
    await mergePanel.getByRole("button", { name: "Confirmar fusión" }).click();
    await expect.poll(() => merges.length).toBe(1);
    expect(merges[0]).toMatchObject({ operation: "category.merge", sourceCategoryId: UTILITIES_ID, targetCategoryId: targetId });
  });

  test("no introduce scroll horizontal en la anchura efectiva", async ({ page }) => {
    await page.goto("/configuration");
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});

test.describe("Fase 2 · Calidad del dato", () => {
  test("el contrato estricto de la fuente permanece verde", async ({ request }) => {
    const response = await request.get("/api/health/data-quality");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBeGreaterThanOrEqual(20);
  });

  test("el contrato OAuth Google permanece limitado y verificable", async ({ request }) => {
    const response = await request.get("/api/health/google-oauth");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBeGreaterThanOrEqual(8);
  });
});

test.describe("Preview protegido real", () => {
  test.skip(!process.env.VERCEL_PREVIEW_URL, "Las comprobaciones live solo se ejecutan cuando se proporciona VERCEL_PREVIEW_URL.");

  test("Fundamentos permanece verde", async ({ request }) => {
    const response = await request.get("/api/health/foundations");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBeGreaterThanOrEqual(36);
  });

  test("calidad del dato de Fase 2 permanece verde", async ({ request }) => {
    const response = await request.get("/api/health/data-quality");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBeGreaterThanOrEqual(20);
  });

  test("OAuth Google permanece verde", async ({ request }) => {
    const response = await request.get("/api/health/google-oauth");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBeGreaterThanOrEqual(8);
  });

  test("ingesta sintética roundtrip termina sin residuos", async ({ request }) => {
    const response = await request.get("/api/health/source-ingestion");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.verified).toBe(true);
    expect(payload.clean).toBe(true);
    expect(payload.residue).toEqual({ accounts: 0, mappings: 0, sources: 0, transactions: 0, cursors: 0 });
  });

  test("Vault OAuth roundtrip termina sin residuos", async ({ request }) => {
    const response = await request.get("/api/health/google-oauth-vault");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.verified).toBe(true);
    expect(payload.clean).toBe(true);
  });

  test("persistencia completa y limpieza terminan verdes", async ({ request }) => {
    const response = await request.get("/api/health/configuration-persistence");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.passed).toBe(payload.total);
    expect(payload.total).toBe(10);
  });
});
