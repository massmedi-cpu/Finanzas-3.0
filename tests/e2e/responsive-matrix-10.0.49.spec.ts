import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  mode: "mobile" | "desktop";
};

const viewports: ViewportCase[] = [
  { name: "móvil compacto 360", width: 360, height: 780, mode: "mobile" },
  { name: "móvil amplio 430", width: 430, height: 932, mode: "mobile" },
  { name: "antes de 30rem", width: 479, height: 900, mode: "mobile" },
  { name: "después de 30rem", width: 481, height: 900, mode: "mobile" },
  { name: "intermedio 600", width: 600, height: 900, mode: "mobile" },
  { name: "tablet antes de 48rem", width: 767, height: 1024, mode: "mobile" },
  { name: "tablet exacto 48rem", width: 768, height: 1024, mode: "mobile" },
  { name: "tablet tras 48rem", width: 769, height: 1024, mode: "desktop" },
  { name: "tablet vertical", width: 820, height: 1180, mode: "desktop" },
  { name: "tablet horizontal", width: 1024, height: 768, mode: "desktop" },
  { name: "portátil", width: 1366, height: 768, mode: "desktop" },
  { name: "antes de 90rem", width: 1439, height: 900, mode: "desktop" },
  { name: "exacto 90rem", width: 1440, height: 900, mode: "desktop" },
  { name: "después de 90rem", width: 1441, height: 900, mode: "desktop" },
  { name: "escritorio", width: 1920, height: 1080, mode: "desktop" },
  { name: "pantalla ancha", width: 2560, height: 1440, mode: "desktop" },
];

const tabletRouteSweep = [
  "/",
  "/cash-flow",
  "/review",
  "/alerts",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/documents",
  "/configuration/source",
] as const;

const tabletViewports: ViewportCase[] = [
  { name: "tablet límite móvil", width: 768, height: 1024, mode: "mobile" },
  { name: "tablet vertical", width: 820, height: 1180, mode: "desktop" },
  { name: "tablet horizontal", width: 1024, height: 768, mode: "desktop" },
];

async function isolateShell(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "responsive_matrix_isolated" }),
    });
  });
}

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectNoViewportOverflow(page: Page, width: number) {
  await settleLayout(page);
  const dimensions = await page.evaluate(() => ({
    htmlClient: document.documentElement.clientWidth,
    htmlScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));

  expect(dimensions.htmlClient).toBe(width);
  expect(dimensions.htmlScroll, `overflow horizontal en <html> a ${width}px`).toBeLessThanOrEqual(dimensions.htmlClient + 1);
  expect(dimensions.bodyScroll, `overflow horizontal en <body> a ${width}px`).toBeLessThanOrEqual(dimensions.bodyClient + 1);
}

async function expectMobileNavigation(page: Page) {
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
  const desktop = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(mobile).toBeVisible();
  await expect(desktop).toBeHidden();

  for (const control of [
    mobile.getByRole("link", { name: "Inicio", exact: true }),
    mobile.getByRole("link", { name: "Movs.", exact: true }),
    mobile.getByRole("link", { name: "Análisis", exact: true }),
    mobile.getByRole("link", { name: "Revisar", exact: true }),
    mobile.getByRole("button", { name: "Más", exact: true }),
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectDesktopNavigation(page: Page, width: number) {
  const desktop = page.getByRole("navigation", { name: "Navegación principal" });
  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });

  await expect(desktop).toBeVisible();
  await expect(mobile).toBeHidden();

  const box = await desktop.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

  const active = desktop.locator('[aria-current="page"]');
  await expect(active).toBeVisible();
  const activeBox = await active.boundingBox();
  expect(activeBox).not.toBeNull();
  expect(activeBox!.height).toBeGreaterThanOrEqual(44);
}

test.describe("Financial App 10.0.49 · contrato responsive Axioma §§72–76", () => {
  for (const viewport of viewports) {
    test(`${viewport.name}: ${viewport.width}x${viewport.height} sin overflow y con navegación correcta`, async ({ page }) => {
      await isolateShell(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");

      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoViewportOverflow(page, viewport.width);

      if (viewport.mode === "mobile") {
        await expectMobileNavigation(page);
      } else {
        await expectDesktopNavigation(page, viewport.width);
      }
    });
  }

  for (const viewport of tabletViewports) {
    test(`${viewport.name}: rutas financieras principales respetan ${viewport.width}px`, async ({ page }) => {
      await isolateShell(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const href of tabletRouteSweep) {
        await page.goto(href);
        await expect(page.locator("#main-content"), `${href} debe montar el contenido principal`).toBeVisible();
        await expectNoViewportOverflow(page, viewport.width);

        if (viewport.mode === "mobile") {
          await expectMobileNavigation(page);
        } else {
          await expectDesktopNavigation(page, viewport.width);
        }
      }
    });
  }

  test("la interfaz cruza 768/769 y 1440/1441 sin recargar ni generar overflow", async ({ page }) => {
    await isolateShell(page);
    await page.setViewportSize({ width: 767, height: 1024 });
    await page.goto("/");

    for (const viewport of [
      { width: 767, height: 1024, mode: "mobile" as const },
      { width: 768, height: 1024, mode: "mobile" as const },
      { width: 769, height: 1024, mode: "desktop" as const },
      { width: 820, height: 1180, mode: "desktop" as const },
      { width: 1024, height: 768, mode: "desktop" as const },
      { width: 1439, height: 900, mode: "desktop" as const },
      { width: 1440, height: 900, mode: "desktop" as const },
      { width: 1441, height: 900, mode: "desktop" as const },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expectNoViewportOverflow(page, viewport.width);
      if (viewport.mode === "mobile") {
        await expectMobileNavigation(page);
      } else {
        await expectDesktopNavigation(page, viewport.width);
      }
    }
  });
});

test("REC-VIS-492 · Inicio adapta la cuadrícula a la anchura efectiva con barra lateral", async ({ page }) => {
  await isolateShell(page);
  for (const scenario of [
    { viewportWidth: 1200, expectedColumns: 2 },
    { viewportWidth: 1500, expectedColumns: 4 },
  ]) {
    await page.setViewportSize({ width: scenario.viewportWidth, height: 900 });
    await page.goto("/");
    const summary = page.getByRole("region", { name: "Resumen financiero principal" });
    await expect(summary).toBeVisible();
    const layout = await page.evaluate(() => {
      const content = document.getElementById("main-content");
      const summary = document.querySelector('section[aria-label="Resumen financiero principal"]');
      if (!content || !summary) return null;
      return {
        contentWidth: content.getBoundingClientRect().width,
        columns: getComputedStyle(summary).gridTemplateColumns.trim().split(/\s+/).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.contentWidth).toBeLessThan(scenario.viewportWidth);
    expect(layout!.columns, "las columnas deben depender del ancho útil").toBe(scenario.expectedColumns);
    expect(layout!.overflow).toBeLessThanOrEqual(1);
  }
});

test("REC-VIS-492 · las siete vistas usan el ancho de contenido y mantienen reglas accesibles", () => {
  const paths = ["app/inicio-overview.module.css","app/accounts/accounts.module.css","app/analysis/analysis.module.css","app/transactions/transactions.module.css","app/budgets/budgets.module.css","app/forecast/forecast.module.css","app/compare/compare.module.css"];
  for (const path of paths) {
    const css = readFileSync(path, "utf8");
    expect(css, path).toContain("@container app-content (max-width:");
    expect(css, path).not.toMatch(/@media\s*\(\s*max-width\s*:/);
    expect(css, path).toContain("grid-template-columns");
  }
});

test("REC-VIS-493 · Configuración muestra todas las pestañas sin recorte en escritorio y la activa en móvil", async ({ page }) => {
  await isolateShell(page);
  for (const width of [360, 820, 1100, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/configuration/source");
    const nav = page.getByRole("navigation", { name: "Áreas de configuración" });
    const disclosure = nav.locator("details");
    const compact = await disclosure.isVisible();
    await expect(nav).toBeVisible();
    if (compact) {
      await expect(disclosure.locator("summary")).toContainText("Fuente bancaria");
      await disclosure.locator("summary").click();
    }
    const links = compact ? disclosure : nav.locator("[data-desktop-areas]");
    const selected = links.getByRole("link", { name: "Fuente bancaria" });
    const final = links.getByRole("link", { name: "Datos y privacidad" });
    await expect(selected).toHaveAttribute("aria-current", "page");
    await expect.poll(async () => links.evaluate((element) => {
      const active = element.querySelector('[aria-current="page"]');
      if (!active) return false;
      const parent = element.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      return box.left >= parent.left - 1 && box.right <= parent.right + 1;
    }), { message: "La pestaña Fuente bancaria no debe estar oculta a " + width + "px" })
      .toBe(true);
    if (!compact) {
      const visible = await nav.evaluate((element) => {
        const last = [...element.querySelectorAll("[data-desktop-areas] a")].at(-1);
        if (!last) return false;
        const parent = element.getBoundingClientRect();
        const box = last.getBoundingClientRect();
        return box.left >= parent.left - 1 && box.right <= parent.right + 1;
      });
      expect(visible, "Datos y privacidad cortado a " + width + "px").toBe(true);
      await expect(final).toBeVisible();
    }
    await expectNoViewportOverflow(page, width);
  }
});

test("REC-VIS-493 · el panel Fuente bancaria cambia a una columna según el contenido real", () => {
  const css = readFileSync("app/configuration/source/source-overview.module.css", "utf8");
  expect(css).toContain("@container app-content (max-width: 70rem)");
  expect(css).toContain("@container app-content (max-width: 35rem)");
  const tabs = readFileSync("app/configuration/configuration-area.module.css", "utf8");
  expect(tabs).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
  expect(tabs).toContain("@container app-content (max-width: 48rem)");
});

test("FA-UI-007 / REC-VIS-494 · siete enlaces accesibles sin hidratación; navegación compacta en móvil", async ({ page }) => {
  await isolateShell(page);
  for (const width of [360, 430, 820, 1100, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/configuration/source", "/configuration/appearance", "/configuration/data"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const nav = page.getByRole("navigation", { name: "Áreas de configuración" });
      await expect(nav).toBeVisible();
      const disclosure = nav.locator("details");
      const compact = await disclosure.isVisible();
      if (compact) {
        const summary = disclosure.locator("summary");
        await expect(summary).toBeVisible();
        expect(await summary.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        await expect(summary).toContainText(
          route === "/configuration/appearance" ? "Apariencia" : route === "/configuration/data" ? "Datos y privacidad" : "Fuente bancaria"
        );
        await expect(disclosure).not.toHaveAttribute("open", "");
        await summary.click();
        await expect(disclosure).toHaveAttribute("open", "");
      }
      const linksContainer = compact ? disclosure : nav.locator("[data-desktop-areas]");
      const geometry = await linksContainer.evaluate((node) => {
        const container = node.getBoundingClientRect();
        const links = [...node.querySelectorAll("a")];
        const hidden = links.filter(link => {
          const box = link.getBoundingClientRect();
          return box.width < 60 || box.height < 44 ||
            box.left < container.left - 1 || box.right > container.right + 1 ||
            box.top < container.top - 1 || box.bottom > container.bottom + 1;
        });
        const selected = node.querySelector('[aria-current="page"]');
        return { count: links.length, hiddenCount: hidden.length, hasSelected: !!selected };
      });
      expect(geometry.count, "Siete destinos reales incluso sin JS").toBe(7);
      expect(geometry.hasSelected, "Página activa: " + route).toBe(true);
      expect(geometry.hiddenCount, route + " a " + width + "px: enlaces disponibles").toBe(0);
      await expectNoViewportOverflow(page, width);
    }
  }
});

test("REC-VIS-494 · Configuración no depende de un desplazamiento tardío de React", () => {
  const css = readFileSync("app/configuration/configuration-area.module.css", "utf8");
  expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  const nav = readFileSync("app/configuration/configuration-area-nav.tsx", "utf8");
  expect(nav).not.toContain("scrollLeft");
  expect(nav).not.toContain("scrollIntoView");
});

test("REC-VIS-495 · Configuración coloca siete pestañas en una sola fila de escritorio", async ({ page }) => {
  await isolateShell(page);
  for (const viewportWidth of [1100, 1366, 1920]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    for (const route of ["/configuration/source", "/configuration/appearance"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const nav = page.getByRole("navigation", { name: "Áreas de configuración" });
      await expect(nav).toBeVisible();
      const geometry = await nav.evaluate(node => {
        const desktop = node.querySelector("[data-desktop-areas]")!;
        const frame = desktop.getBoundingClientRect();
        const links = [...desktop.querySelectorAll("a")].map(element => element.getBoundingClientRect());
        const tracks = getComputedStyle(desktop).gridTemplateColumns.trim().split(/\s+/);
        return {
          tracks: tracks.length,
          rows: new Set(links.map(box => Math.round(box.top))).size,
          visible: links.every(box => box.width >= 1 && box.height >= 44 &&
            box.left >= frame.left - 1 && box.right <= frame.right + 1),
        };
      });
      expect(geometry.tracks, route + " a " + viewportWidth + "px: 7 columnas").toBe(7);
      expect(geometry.rows, route + " a " + viewportWidth + "px: sin pestaña huérfana").toBe(1);
      expect(geometry.visible, route + " a " + viewportWidth + "px: todas visibles").toBe(true);
      await expectNoViewportOverflow(page, viewportWidth);
    }
  }
});
