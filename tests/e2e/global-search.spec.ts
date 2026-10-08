import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { shouldOpenGlobalSearchShortcut } from "../../app/global-search-shortcut";

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
  const input = dialog.getByRole("combobox", { name: "Buscar en Financial App" });
  await input.fill("Mercadona");

  const result = dialog.getByRole("option", { name: /Mercadona.*29,10/ }).first();
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("href", /dateFrom=2026-09-16/);
  await expect(result).toHaveAttribute("href", /merchantId=bbbbbbbb/);
});

test("Buscador global conserva un atajo seguro sin secuestrar campos editables", () => {
  const base = {
    key: "/",
    code: "Slash",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    targetTagName: "BODY",
    targetContentEditable: false,
  };

  expect(shouldOpenGlobalSearchShortcut(base)).toBe(true);
  expect(shouldOpenGlobalSearchShortcut({ ...base, key: "?" })).toBe(true);
  expect(shouldOpenGlobalSearchShortcut({ ...base, targetTagName: "INPUT" })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, targetTagName: "TEXTAREA" })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, targetTagName: "SELECT" })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, targetTagName: "DIV", targetContentEditable: true })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, ctrlKey: true })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, metaKey: true })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, altKey: true })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ ...base, key: "x", code: "KeyX" })).toBe(false);
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

test("AUD-E2E-BUS-001 · buscador rápido y listado completo distinguen alcance", async ({ page }) => {
  await page.route("**/api/search?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      query: "mercadona", partial: false, items: [
        { id: "t1", kind: "transaction", title: "Mercadona", subtitle: null, href: "/transactions?dateFrom=2026-09-25", amountCents: -1200 },
        { id: "m1", kind: "merchant", title: "Mercadona", subtitle: null, href: "/transactions?merchantId=11111111-1111-4111-8111-111111111111" },
      ],
    }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Buscar en Financial App" }).fill("mercadona");
  await expect(dialog.getByText(/Resultados rápidos · 2 mostrados/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Ver todos los movimientos para «mercadona»/ })).toHaveAttribute("href", "/transactions?q=mercadona");
});

test("AUD-E2E-BUS-001 · permite reintentar un error sin cambiar la búsqueda", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/search?**", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporarily_unavailable"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) });
  });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  const input = dialog.getByRole("combobox", { name: "Buscar en Financial App" });
  await input.fill("Mercadona");
  await expect(dialog.getByText("No se pudo completar la búsqueda", { exact: true })).toBeVisible();
  const retry = dialog.getByRole("button", { name: "Reintentar búsqueda" });
  await expect(retry).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Resultados de búsqueda" })).toContainText("No se pudo completar");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await retry.click();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("option")).toHaveCount(2);
  await expect(dialog.getByRole("listbox", { name: "Resultados de búsqueda" })).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  expect(calls).toBe(2);
});

test("AUD-E2E-BUS-001 · oculta resultados obsoletos mientras consulta un término nuevo", async ({ page }) => {
  await page.route("**/api/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Mercadona") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query, partial: false, items: [] }) }).catch(() => {});
    }
  });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  const input = dialog.getByRole("combobox", { name: "Buscar en Financial App" });
  await input.fill("Mercadona");
  await expect(dialog.getByRole("option")).toHaveCount(2);
  await input.fill("Otro comercio");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.getByText("Buscando coincidencias…")).toBeVisible();
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar en Financial App" })).toBeFocused();
});

for (const width of [360, 390, 768]) {
  test(`AUD-E2E-VAL-001 · búsqueda y reintento accesibles a ${width}px en claro y oscuro`, async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 780 });
      await page.emulateMedia({ colorScheme: theme });
      await page.route("**/api/search?**", (route) => route.fulfill({
        status: 503, contentType: "application/json", body: '{"error":"temporarily_unavailable"}',
      }));
      await page.goto("/onboarding");
      await page.getByRole("button", { name: "Buscar en Financial App" }).click();
      const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
      await dialog.getByRole("combobox").fill("sin respuesta");
      const retry = dialog.getByRole("button", { name: "Reintentar búsqueda" });
      await expect(retry).toBeVisible();
      const bounds = await retry.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await dialog.getByRole("combobox").press("Escape");
    }
  });
}

test("AUD-E2E-BUS-001 · nunca abre un resultado anterior al cambiar de consulta y pulsar Enter", async ({ page }) => {
  await page.route("**/api/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Mercadona") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 850));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ query, partial: false, items: [] }),
      }).catch(() => {});
    }
  });

  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  const input = dialog.getByRole("combobox", { name: "Buscar en Financial App" });
  await input.fill("Mercadona");
  await expect(dialog.getByRole("option")).toHaveCount(2);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /-result-0$/);

  await input.fill("Otro comercio");
  await input.press("Enter");
  await expect(input).toHaveValue("Otro comercio");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/onboarding/);
});

test("AUD-E2E-BUS-001 · el resumen opcional no tapa la lista ni el pie en móvil", async ({ page }) => {
  await mockSearch(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
  await dialog.getByRole("combobox").fill("Mercadona");
  await expect(dialog.getByRole("option")).toHaveCount(2);
  const summary = dialog.getByText(/Resultados rápidos · 2 mostrados/);
  const list = dialog.getByRole("listbox", { name: "Resultados de búsqueda" });
  const footer = dialog.getByRole("link", { name: /Ver todos los movimientos/ });
  for (const node of [summary, list, footer]) await expect(node).toBeVisible();
  const bounds = await Promise.all([summary, list, footer].map((node) => node.boundingBox()));
  expect(bounds[0]!.y + bounds[0]!.height).toBeLessThanOrEqual(bounds[1]!.y + 1);
  expect(bounds[1]!.y + bounds[1]!.height).toBeLessThanOrEqual(bounds[2]!.y + 1);
  expect(bounds[2]!.y + bounds[2]!.height).toBeLessThanOrEqual(641);
});
