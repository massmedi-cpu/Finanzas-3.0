import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const RESPONSE = {
  query: "Mercadona",
  partial: false,
  items: [
    {
      id: "transaction:11111111-1111-4111-8111-111111111111",
      kind: "transaction",
      title: "Mercadona",
      subtitle: "Compra semanal · 2026-09-16 · Cuenta principal · Alimentación",
      href: "/transactions?dateFrom=2026-09-16&dateTo=2026-09-16&accountId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&merchantId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      amountCents: -2910,
      date: "2026-09-16",
    },
    {
      id: "merchant:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      kind: "merchant",
      title: "Mercadona",
      subtitle: "Comercio",
      href: "/transactions?merchantId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  ],
};

async function mockSearch(page: Parameters<typeof test>[0] extends never ? never : any) {
  await page.route(/\/api\/search\?q=.*/, async (route: any) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("q")).toBe("Mercadona");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) });
  });
}

test("Buscador global está disponible desde AppShell y abre resultados útiles", async ({ page }) => {
  await mockSearch(page);
  await page.goto("/onboarding");

  const trigger = page.getByRole("button", { name: "Buscar en Financial App" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox");
  await input.fill("Mercadona");

  const result = dialog.getByRole("option", { name: /Mercadona.*29,10/ }).first();
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("href", /dateFrom=2026-09-16/);
  await expect(result).toHaveAttribute("href", /merchantId=bbbbbbbb/);
});

test("Buscador global responde al atajo y no secuestra campos editables", async ({ page }) => {
  await mockSearch(page);
  await page.goto("/onboarding");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Slash", bubbles: true, cancelable: true }));
  });
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const existingInput = page.locator("input").first();
  if (await existingInput.count()) {
    await existingInput.focus();
    await existingInput.evaluate((input) => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Slash", bubbles: true, cancelable: true }));
    });
    await expect(dialog).toBeHidden();
  }
});

test("Buscador global cabe en móvil y mantiene objetivos táctiles", async ({ page }) => {
  await mockSearch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  await dialog.getByRole("combobox").fill("Mercadona");
  await expect(dialog.getByRole("option").first()).toBeVisible();

  const triggerBox = await page.getByRole("button", { name: "Buscar en Financial App" }).boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Endpoint global reutiliza consultas canónicas y no introduce IA ni una segunda fuente financiera", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/search/route.ts"), "utf8");
  expect(source).toContain("callPersistenceGatewayBatch");
  expect(source).toContain('action: "transaction.query"');
  expect(source).toContain('action: "document.list"');
  expect(source).toContain('action: "transaction.facets"');
  expect(source).not.toContain("generative");
  expect(source).not.toContain("openai");
  expect(source).not.toContain("financial_period_summary");
});
