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
      iconKey: "wallet",
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
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FIXTURE),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
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

  test("no ofrece jerarquías, fusiones ni ciclos de vida imposibles", async ({ page }) => {
    await page.goto("/configuration");
    await page.getByRole("button", { name: /Categorías/ }).click();

    const homeCard = page.locator("article.entity-card").filter({ hasText: "Hogar" });
    await expect(homeCard.getByRole("button", { name: "Archivar" })).toBeDisabled();

    await page.getByRole("button", { name: "Editar Hogar" }).click();

    const typeSelect = page.locator("#category-form select").nth(0);
    const incomeOption = typeSelect.locator('option[value="income"]');
    const transferOption = typeSelect.locator('option[value="transfer"]');
    expect(await incomeOption.evaluate((option: HTMLOptionElement) => option.disabled)).toBe(true);
    expect(await transferOption.evaluate((option: HTMLOptionElement) => option.disabled)).toBe(true);

    const parentSelect = page.locator("#category-form select").nth(1);
    await expect(parentSelect.locator(`option[value="${UTILITIES_ID}"]`)).toHaveCount(0);

    const mergePanel = page.locator(".merge-panel");
    await mergePanel.getByLabel("Origen").selectOption(HOME_ID);
    const targetSelect = mergePanel.getByLabel("Destino");
    await expect(targetSelect.locator(`option[value="${UTILITIES_ID}"]`)).toHaveCount(0);
    await expect(targetSelect.locator(`option[value="${INCOME_ID}"]`)).toHaveCount(0);
  });

  test("no introduce scroll horizontal en la anchura efectiva", async ({ page }) => {
    await page.goto("/configuration");
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
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
    expect(payload.total).toBeGreaterThanOrEqual(12);
  });
});

test.describe("Preview protegido real", () => {
  test.skip(
    !process.env.VERCEL_PREVIEW_URL,
    "Las comprobaciones live solo se ejecutan cuando se proporciona VERCEL_PREVIEW_URL.",
  );

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
    expect(payload.total).toBeGreaterThanOrEqual(12);
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
