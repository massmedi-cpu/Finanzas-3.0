import { expect, test } from "@playwright/test";

const merchants = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Carrefour",
    normalized_name: "carrefour",
    default_category_id: "20000000-0000-4000-8000-000000000001",
    lifecycle: "active",
    default_category_name: "Supermercado",
    default_category_kind: "expense",
    default_category_lifecycle: "active",
    alias_count: 1,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    name: "Comercio antiguo",
    normalized_name: "comercio antiguo",
    default_category_id: null,
    lifecycle: "archived",
    default_category_name: null,
    default_category_kind: null,
    default_category_lifecycle: null,
    alias_count: 0,
  },
];

const aliases = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    merchant_id: merchants[0].id,
    alias: "TPV CARREFOUR 123",
    normalized_alias: "tpv carrefour 123",
  },
];

async function mockMerchantApis(page: import("@playwright/test").Page) {
  await page.route("**/api/configuration", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accounts: [],
        categories: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            name: "Supermercado",
            kind: "expense",
            lifecycle: "active",
          },
        ],
      }),
    });
  });

  await page.route("**/api/merchants", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ merchants, aliases }) });
      return;
    }

    const body = route.request().postDataJSON() as { operation?: string; label?: string };
    if (body.operation === "merchant.resolve") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ merchant: body.label ? merchants[0] : null }),
      });
      return;
    }

    if (body.operation === "merchant.save") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ merchant: merchants[0] }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: true }) });
  });
}

test("Comercios y alias mantiene una UX responsive, accesible y sin escritura bancaria", async ({ page }) => {
  await mockMerchantApis(page);
  await page.goto("/configuration/merchants");

  await expect(page.getByRole("heading", { name: "Comercios y alias", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Comercios y alias" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Carrefour", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("TPV CARREFOUR 123", { exact: true })).toBeVisible();
  await expect(page.getByText("Normalizado: carrefour")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("button, input, select").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
});

test("Comercios y alias permite alta canónica y comprobación de equivalencias", async ({ page }) => {
  await mockMerchantApis(page);
  await page.goto("/configuration/merchants");

  await page.getByLabel("Nombre canónico").fill("Carrefour");
  await page.getByLabel("Categoría predeterminada").selectOption("20000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Crear comercio" }).click();
  await expect(page.getByRole("status")).toContainText("Comercio creado y persistido.");

  await page.getByLabel("Texto recibido").fill("TPV CARREFOUR 123");
  await page.getByRole("button", { name: "Resolver" }).click();
  await expect(page.getByText("Coincide con Carrefour.")).toBeVisible();
});
