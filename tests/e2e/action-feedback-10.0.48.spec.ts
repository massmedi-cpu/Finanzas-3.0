import { expect, test } from "@playwright/test";

const rule = {
  id: "rule-feedback-test",
  name: "Regla de prueba",
  status: "active",
  priority: 100,
  concept_contains: "TEST",
  merchant_id: null,
  account_id: null,
  category_id: null,
  minimum_amount_cents: null,
  maximum_amount_cents: null,
  target_category_id: "category-test",
  target_merchant_id: null,
  merchant_name: null,
  account_name: null,
  category_name: null,
  target_category_name: "Pruebas",
  target_merchant_name: null,
};

const payload = {
  rules: [rule],
  accounts: [],
  categories: [{ id: "category-test", name: "Pruebas", kind: "expense", lifecycle: "active" }],
  merchants: [],
};

test("una acción real permanece pending hasta que el servidor confirma el resultado", async ({ page }) => {
  let releasePost!: () => void;
  const postGate = new Promise<void>((resolve) => { releasePost = resolve; });

  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    await postGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { evaluated: 3, matched: 2, merchantChanged: 0, categoryChanged: 2 } }),
    });
  });

  await page.goto("/configuration/rules");
  const apply = page.getByRole("button", { name: "Aplicar reglas" });
  await expect(apply).toBeEnabled();
  await apply.click();

  const feedback = page.locator('[data-action-id="rules:apply-all"]');
  await expect(feedback).toHaveAttribute("data-state", "pending");
  await expect(feedback).toContainText("Aplicando reglas");
  await expect(feedback).not.toHaveAttribute("data-state", "success");

  releasePost();
  await expect(feedback).toHaveAttribute("data-state", "success");
  await expect(feedback).toContainText("3 movimientos evaluados y 2 coincidencias");
  await expect(feedback).toHaveAttribute("role", "status");
});

test("un fallo real sustituye pending por error y nunca anuncia éxito", async ({ page }) => {
  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "forced_failure" }) });
  });

  await page.goto("/configuration/rules");
  await page.getByRole("button", { name: "Aplicar reglas" }).click();

  const feedback = page.locator('[data-action-id="rules:apply-all"]');
  await expect(feedback).toHaveAttribute("data-state", "error");
  await expect(feedback).toHaveAttribute("role", "alert");
  await expect(feedback).toContainText("No se pudo completar la operación");
  await expect(feedback).not.toContainText("Motor aplicado");

  await feedback.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(feedback).toHaveCount(0);
});

test("el contrato global cubre los flujos nombrados sin ampliar permisos bancarios", async () => {
  const fs = await import("node:fs/promises");
  const provider = await fs.readFile("app/action-feedback.tsx", "utf8");
  const documents = await fs.readFile("app/documents/documents-client.tsx", "utf8");
  const ocr = await fs.readFile("app/documents/ocr-review-panel.tsx", "utf8");
  const budgets = await fs.readFile("app/budgets/budgets-client.tsx", "utf8");
  const rules = await fs.readFile("app/configuration/rules/rules-client.tsx", "utf8");
  const source = await fs.readFile("app/configuration/source/source-client.tsx", "utf8");

  expect(provider).toContain('type ActionFeedbackState = "pending" | "success" | "error"');
  expect(provider).toContain('role={item.state === "error" ? "alert" : "status"}');
  expect(documents).toContain('action.startsWith("associate-")');
  expect(ocr).toContain("documents:ocr:");
  expect(budgets).toContain("budgets:save-limit");
  expect(rules).toContain("rules:evaluate");
  expect(source).toContain("source:sync");
  expect(source).toContain("modo solo lectura");
  expect(source).not.toContain("drive.file");
});
