import { expect, test } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000001";
const merchantId = "30000000-0000-4000-8000-000000000001";
const ruleId = "50000000-0000-4000-8000-000000000001";

const payload = {
  rules: [
    {
      id: ruleId,
      name: "Supermercado mensual",
      status: "active",
      priority: 20,
      concept_contains: "carrefour",
      merchant_id: null,
      account_id: accountId,
      category_id: null,
      minimum_amount_cents: -20000,
      maximum_amount_cents: -100,
      target_category_id: categoryId,
      target_merchant_id: merchantId,
      merchant_name: null,
      account_name: "Cuenta corriente Openbank · 3967",
      category_name: null,
      target_category_name: "Supermercado",
      target_merchant_name: "Carrefour",
    },
  ],
  accounts: [{ id: accountId, name: "Cuenta corriente Openbank · 3967", lifecycle: "active" }],
  categories: [{ id: categoryId, name: "Supermercado", kind: "expense", lifecycle: "active" }],
  merchants: [{ id: merchantId, name: "Carrefour", lifecycle: "active" }],
};

async function mockRuleApi(page: import("@playwright/test").Page) {
  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    const body = route.request().postDataJSON() as { operation?: string };
    if (body.operation === "rule.save") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rule: payload.rules[0] }) });
      return;
    }
    if (body.operation === "rule.apply_all") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { evaluated: 3172, matched: 48, merchantChanged: 11, categoryChanged: 42, limit: 10000 } }),
      });
      return;
    }
    if (body.operation === "rule.evaluate") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { transactionId: "60000000-0000-4000-8000-000000000001", selectedRuleId: ruleId, selectedRuleName: "Supermercado mensual", selectedRulePriority: 20, merchantLocked: false, categoryLocked: false } }),
      });
      return;
    }
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unsupported" }) });
  });
}

test("Reglas mantiene una UX responsive y controles accesibles", async ({ page }) => {
  await mockRuleApi(page);
  await page.goto("/configuration/rules");

  await expect(page.getByRole("heading", { name: "Reglas de categorización", level: 1 })).toBeVisible();
  const activeNavigation = page.getByRole("navigation", { name: "Navegación principal" });
  if (await activeNavigation.isVisible()) {
    await expect(activeNavigation.getByRole("link", { name: "Configuración", exact: true })).toHaveAttribute("aria-current", "page");
  } else {
    await page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("button", { name: "Más", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Más secciones" }).getByRole("link", { name: "Configuración", exact: true }))
      .toHaveAttribute("aria-current", "page");
  }
  await expect(page.getByText("FINANCIAL APP · REGLAS", { exact: true })).toBeVisible();
  await expect(page.getByText("Supermercado mensual", { exact: true })).toBeVisible();
  await expect(page.getByText(/El número más bajo se aplica primero/)).toBeVisible();
  await expect(page.getByText(/fuente bancaria sigue siendo de solo lectura/i)).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main button, main input, main select").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
});

test("Reglas permite definir condiciones y destino sin duplicar la lógica en cliente", async ({ page }) => {
  await mockRuleApi(page);
  await page.goto("/configuration/rules");

  await page.getByRole("button", { name: "+ Nueva regla" }).click();
  await page.getByLabel("Nombre").fill("Compra recurrente");
  await page.getByLabel("Prioridad").fill("15");
  await page.getByLabel("Concepto contiene").fill("carrefour");
  await page.getByLabel("Cuenta").selectOption(accountId);
  await page.getByLabel("Importe mínimo (€)").fill("-200,00");
  await page.getByLabel("Importe máximo (€)").fill("-1,00");
  await page.getByLabel("Asignar comercio").selectOption(merchantId);
  await page.getByLabel("Asignar categoría").selectOption(categoryId);
  await page.getByRole("button", { name: "Crear regla" }).click();
  await expect(page.locator('[data-action-id="rules:create"]')).toContainText("Regla guardada en el motor central");
});

test("Reglas expone aplicación explícita y explicación auditable", async ({ page }) => {
  await mockRuleApi(page);
  await page.goto("/configuration/rules");

  await page.getByRole("button", { name: "Aplicar reglas" }).click();
  await expect(page.locator('[data-action-id="rules:apply-all"]')).toContainText("3172 movimientos evaluados");
  await expect(page.getByText("48", { exact: true })).toBeVisible();

  await page.getByText("Introducir identificador manualmente").click();
  await page.getByLabel("ID del movimiento").fill("60000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: /Explicar decisión/ }).click();
  const explanation = page.locator("pre");
  await expect(explanation).toContainText('"selectedRuleName": "Supermercado mensual"');
  await expect(explanation).toContainText('"selectedRulePriority": 20');
});

test("AUD-E2E-REG-001 · el simulador ofrece movimientos legibles y nunca ejecuta escritura bancaria", async ({ page }) => {
  const reads: string[] = [];
  await mockRuleApi(page);
  await page.route(/\/api\/transactions(?:\?.*)?$/, async (route) => {
    reads.push(route.request().method());
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        rows: [{
          id: "60000000-0000-4000-8000-000000000001",
          bankDate: "2026-09-15",
          amountCents: -2850,
          merchant: { effectiveName: "Mercadona" },
          account: { name: "Cuenta principal" },
          concept: { effective: "Compra Mercadona" },
        }],
        totalCount: 1,
      }),
    });
  });
  await page.goto("/configuration/rules");
  await page.getByLabel("Buscar movimiento").fill("Mercadona");
  await page.getByRole("button", { name: "Buscar movimientos" }).click();
  const select = page.getByLabel("Movimiento para simular");
  await expect(select).toContainText("15");
  await expect(select).toContainText("Mercadona");
  await expect(select).toContainText("Cuenta principal");
  await expect(select).toContainText("28,50");
  await select.selectOption("60000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: /Explicar decisión/ }).click();
  await expect(page.getByLabel("Resultado de la simulación")).toContainText("Supermercado mensual");
  expect(reads).toEqual(["GET"]);
});

test("AUD-E2E-REG-001 · sin reglas no se anuncia una búsqueda fallida", async ({ page }) => {
  await mockRuleApi(page);
  await page.route("**/api/rules", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ rules: [], accounts: [], categories: [], merchants: [] }),
    });
  });
  await page.goto("/configuration/rules");
  await expect(page.getByText("Todavía no hay reglas.")).toBeVisible();
  await expect(page.getByText("No hay reglas que coincidan con la búsqueda.")).toHaveCount(0);
  await page.getByRole("button", { name: "Crear la primera regla" }).click();
  await expect(page.getByRole("heading", { name: "Nueva regla" })).toBeVisible();
});
