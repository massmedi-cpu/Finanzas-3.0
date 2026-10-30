import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { configurationRoutes, navigationItems } from "../../app/navigation-items";
import { mockRecoveryHome } from "./helpers/recovery-home";

// Native date inputs use the browser locale even when the document has lang="es".
// Capture the Spanish product experience and keep ISO values explicit below.
test.use({ locale: "es-ES" });

const widths = [360, 390, 430, 600, 768, 820, 1024, 1100, 1366, 1440, 1920];
const routes = [...navigationItems.map((item) => item.href), ...configurationRoutes];

async function noOverflow(page: Page, width: number) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")].flatMap((element) => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return box.width && box.right > innerWidth + 1 && css.visibility !== "hidden" && css.position !== "fixed"
        ? [{ tag: element.tagName, className: element.className, right: Math.round(box.right) }] : [];
    }).slice(0, 12),
  }));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
    timeout: 1500, message: `${width}px: ${JSON.stringify(layout.offenders)}`,
  }).toBeLessThanOrEqual(1);
}

test("REC-VIS-007 · los 21 destinos canónicos tienen matriz visual; los alias se verifican como redirecciones", () => {
  expect(routes).toHaveLength(21);
  expect(new Set(routes).size).toBe(21);
  expect(routes).toContain("/configuration/preferences");
  expect(routes).toContain("/configuration/source/diagnostics");
  expect(routes).not.toContain("/configuration/accounts");
  expect(routes).not.toContain("/configuration/categories");
});

test("REC-UI-ONBOARD-188 · Primeros pasos usa superficies y contraste accesibles en ambos temas", async ({ page }) => {
  await mockRecoveryHome(page, "covered");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/onboarding");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "De tus movimientos a una visión clara de tu dinero" })).toBeVisible();
    const colors = await page.evaluate(() => {
      const heading = document.querySelector("main header h1") as HTMLElement;
      const shell = heading.closest("main")!;
      const hero = heading.closest("header")!;
      const action = shell.querySelector("section[aria-labelledby='next-action-heading']")!;
      const firstStep = shell.querySelector("li[data-step-status]")!;
      const number = firstStep.querySelector("span")!;
      const styles = (node: Element) => getComputedStyle(node);
      return {
        shellBackground: styles(shell).backgroundImage,
        heroBackground: styles(hero).backgroundImage,
        actionBackground: styles(action).backgroundImage,
        cardBackground: styles(firstStep).backgroundImage,
        numberForeground: styles(number).color,
        numberBackground: styles(number).backgroundColor,
      };
    });
    expect(colors.shellBackground).toBe("none");
    for (const surface of [colors.heroBackground, colors.actionBackground, colors.cardBackground]) {
      expect(surface).toContain("gradient");
      expect(surface).not.toContain("21, 33, 56");
    }
    const rgb = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const luminance = (values: number[]) => {
      const linear = values.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const foreground = luminance(rgb(colors.numberForeground));
    const background = luminance(rgb(colors.numberBackground));
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    expect(ratio, `Contraste insuficiente del número de paso en ${theme}`).toBeGreaterThanOrEqual(4.5);
  }
});

// FA-UI-018: 503 responses in both themes must never be counted as 0/5.
test("FA-UI-018 · progreso no verificado tras fallos de lectura", async ({ page }) => {
  await mockRecoveryHome(page, "none");
  await page.route("**/api/source/google/status", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.route("**/api/source/google/sync", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.route("**/api/configuration", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 820, 1366]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/onboarding");
      const progress = page.getByRole("group", { name: "Progreso de puesta en marcha" });
      await expect(progress.locator("strong")).toHaveText("—/5");
      await expect(progress).toContainText("Avance sin verificar");
      await expect(page.getByText("0/5", { exact: true })).toHaveCount(0);
      await noOverflow(page, width);
    }
  }
});

// REC-VIS-251: a visually blue button in the light theme used the regular dark
// text token and scored only ~2.74:1. Axe found no issue on an unloaded screen,
// so explicitly measure the rendered call-to-action on both real browser themes.
test("REC-VIS-251 · forecast primary CTA text meets AA contrast at phone and desktop widths", async ({ page }) => {
  await mockRecoveryHome(page, "covered");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: width === 360 ? 900 : 1024 });
      await page.goto("/forecast");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const action = page.getByRole("button", { name: "Actualizar recurrentes" });
      await expect(action).toBeVisible();
      const colors = await action.evaluate((node) => {
        const style = getComputedStyle(node);
        const channels = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
        const luminance = (value: string) => {
          const rgb = channels(value);
          if (rgb.length !== 3) return Number.NaN;
          const linear = rgb.map(channel => {
            const normal = channel / 255;
            return normal <= 0.04045 ? normal / 12.92 : ((normal + 0.055) / 1.055) ** 2.4;
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const fg = luminance(style.color);
        const bg = luminance(style.backgroundColor);
        return {
          text: style.color,
          background: style.backgroundColor,
          contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
        };
      });
      const where = theme + " / " + width + "px";
      expect(colors.background, "Opaque forecast button background at " + where).toMatch(/^rgb\(/);
      expect(colors.text, "Explicit forecast button text at " + where).toMatch(/^rgb\(/);
      expect(colors.contrast, "Forecast primary CTA AA contrast at " + where).toBeGreaterThanOrEqual(4.5);
    }
  }
});

// FA-UI-003/004/005/013–017: verify the actual browser state after an API
// error, at the three representative viewports and in both visual themes.
// Synthetic API failures prove presentation only, never backend correctness.
for (const theme of ["light", "dark"] as const) {
  test(`FA-UI · fallos de lectura no se presentan como cero confirmado · ${theme}`, async ({ page }, info) => {
    await mockRecoveryHome(page, "none");
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 820, 1366]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/configuration");
      await expect(page.getByRole("heading", { name: "Configuración sin verificar" })).toBeVisible();
      await expect(page.locator(".configuration-summary strong").first()).toHaveText("—");
      await expect(page.getByRole("button", { name: "Crear cuenta" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
      await noOverflow(page, width);

      await page.goto("/configuration/rules");
      await expect(page.getByRole("heading", { name: "Reglas sin verificar" })).toBeVisible();
      await expect(page.getByRole("button", { name: "+ Nueva regla" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
      await noOverflow(page, width);

      await page.goto("/configuration/merchants");
      await expect(page.getByRole("heading", { name: "Comercios sin verificar" })).toBeVisible();
      await expect(page.getByRole("button", { name: "+ Nuevo comercio" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
      await noOverflow(page, width);

      await page.goto("/accounts");
      await expect(page.getByText("Estado sin verificar · saldo y fecha desconocidos")).toBeVisible();
      await expect(page.getByRole("button", { name: "Reintentar lectura" })).toBeVisible();
      await noOverflow(page, width);

      await page.goto("/configuration/source");
      await expect(page.getByRole("heading", { name: "Estado de Google sin verificar" })).toBeVisible();
      await expect(page.locator(".configuration-summary strong").first()).toHaveText("—");
      await noOverflow(page, width);

      await page.goto("/review");
      await expect(page.getByText("Revisión incompleta", { exact: true })).toBeVisible();
      await expect(page.getByText("Todo en orden", { exact: true })).toHaveCount(0);
      await noOverflow(page, width);

      // Preserve a visual artifact of the regression state for human review.
      await page.screenshot({ path: info.outputPath(`review-unverified-${theme}-${width}.png`), fullPage: true });
    }
  });

  test(`FA-UI · Preferencias legibles y radios semánticos · ${theme}`, async ({ page }, info) => {
    await mockRecoveryHome(page, "covered");
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 820, 1366]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/configuration/preferences");
      const group = page.getByRole("group", { name: "Vista por defecto" });
      await expect(group.getByRole("radio")).toHaveCount(2);
      const names = await group.getByRole("radio").evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLInputElement).name));
      expect(names).toEqual(["budget-focus", "budget-focus"]);
      const panel = page.locator(".configuration-grid .config-panel").first();
      expect(await panel.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft))).toBeGreaterThanOrEqual(16);
      await noOverflow(page, width);
      if (width === 360) {
        const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(accessibility.violations.map((v) => v.id)).toEqual([]);
      }
      await page.screenshot({ path: info.outputPath(`preferences-${theme}-${width}.png`), fullPage: true });
    }
  });
}

// FA-UI-008: keep search and essentials usable without seven single-column rows.
for (const theme of ["light", "dark"] as const) {
  test(`FA-UI-008 · filtros esenciales en móvil ${theme}`, async ({ page }) => {
    await mockRecoveryHome(page, "none");
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 920 });
      await page.goto("/transactions");
      const form = page.getByRole("form", { name: "Filtros de movimientos" });
      await expect(form).toBeVisible();
      const essential = page.locator("main form").filter({ has: page.locator('[data-testid="account-filter"]') });
      const layout = await essential.locator('[class*="coreFilters"]').evaluate(node => {
        const style = getComputedStyle(node);
        return { tracks: style.gridTemplateColumns.split(/\s+/).filter(Boolean).length, gap: style.columnGap };
      });
      expect(layout.tracks).toBe(2);
      const dates = form.getByText("Desde", { exact: true });
      await expect(dates.first()).toBeVisible();
      // The accessible name changes when expanded ("Ocultar filtros avanzados").
      // Locate the same disclosure by its stable relationship to the panel.
      const more = form.locator('button[aria-controls="movement-advanced-filters"]');
      await expect(more).toHaveCount(1);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toHaveText(/Más filtros/);
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await expect(more).toHaveText(/Ocultar filtros avanzados/);
      await expect(form.getByText("Revisión", { exact: true })).toBeVisible();
      await noOverflow(page, width);
    }
  });
}

// This matrix verifies browser rendering with synthetic data and unavailable states.
// Real persistence is evaluated separately by authenticated isolation, without mocks.
for (const theme of ["light", "dark"] as const) {
  for (const route of routes) {
    test(`REC-UI · ${theme} ${route} · 11 tamaños y accesibilidad`, async ({ page }, info) => {
      await mockRecoveryHome(page, "covered");
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // A 404 has an H1 too: prevent broken routes passing the visual matrix.
      await expect(page.getByText("Esta página no existe", { exact: true })).toHaveCount(0);
      await page.waitForTimeout(150);
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 900 : 1024 });
        await noOverflow(page, width);
        if (route === "/" && width === 360) {
          // A 7–9px legend may pass overflow and axe but is not readable
          // in real mobile banking use. Test actual computed typography.
          const month = page.locator('button[data-month-coverage] > span:nth-child(2)').first();
          const partial = page.locator('button[data-month-coverage="partial"] > span:nth-child(3)').first();
          await expect(month).toBeVisible();
          await expect(partial).toBeVisible();
          expect(await month.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(11);
          expect(await partial.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(10);
        }
        if (width >= 1100) {
          const nav = page.getByRole("navigation", { name: "Navegación principal" });
          await expect(nav).toHaveCSS("flex-direction", "column");
          await expect.poll(() => nav.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(224);
          expect(await page.locator("#main-content").evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(224);
        }
        // Keep representative mobile, tablet and desktop captures for human visual review.
        if ([360, 820, 1366].includes(width)) {
          await page.screenshot({ path: info.outputPath(`${theme}-${width}.png`), fullPage: true });
        }
      }
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }))).toEqual([]);
    });
  }
}

// The route-wide matrix already certifies empty/unavailable surfaces. This
// second pass actually populates the document workspace, so text density,
// long names, detail controls and contrast cannot hide behind empty states.
for (const theme of ["light", "dark"] as const) {
  for (const width of [360, 1366]) {
    test(`REC-UI-DOC · documentos poblados ${theme} ${width}px`, async ({ page }, info) => {
      const principles = {
        bankSource: "read_only", ocrEnabled: false,
        getHasSideEffects: false, suggestionsPersisted: false,
        associationsRequireConfirmation: true,
      };
      const items = Array.from({ length: 12 }, (_, index) => ({
        id: `a0d30000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        originalFileName: index === 0
          ? "Factura detallada de suministros de septiembre 2026 — referencia extensa.pdf"
          : `Recibo servicio ${String(index + 1).padStart(2, "0")}.pdf`,
        type: index % 3 === 0 ? "invoice" : index % 3 === 1 ? "ticket" : "other",
        status: index % 4 === 0 ? "pending_review" : index % 4 === 1 ? "confirmed" : index % 4 === 2 ? "imported" : "archived",
        mimeType: "application/pdf",
        notes: "", associationCount: 0, documentDate: "2026-09-12",
        totalCents: 2500 + index * 1237, issuerName: "Comercio de prueba",
        storageProvider: "supabase", createdAt: "2026-09-12T10:00:00Z",
        updatedAt: "2026-09-12T10:00:00Z", sizeBytes: 123456,
        sourceModifiedAt: null, sourceDriveFileId: null,
      }));
      await page.route("**/api/**", route =>
        route.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
      await page.route(/\/api\/documents(?:\?.*)?$/, async route => {
        const url = new URL(route.request().url());
        const requested = url.searchParams.get("id");
        if (requested) {
          const document = items.find(item => item.id === requested);
          if (!document) return route.fulfill({ status: 404, json: { error: "not_found" } });
          return route.fulfill({
            json: { contractVersion: 3, document, associations: [], principles },
          });
        }
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        return route.fulfill({ json: {
          contractVersion: 3, items: items.slice(offset, offset + limit),
          total: items.length, limit, offset, testCount: 0, principles,
        } });
      });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 920 });
      await page.goto("/documents");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { name: "Documentos", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "12 documentos" })).toBeVisible();
      // REC-UI-DOC-009: the import form must not squeeze four labels into a
      // single unreadable desktop row. The actual container width, not the
      // outer viewport, determines the grid; mobile remains one column.
      const uploadForm = page.locator("form").filter({ has: page.locator("#document-file") });
      await expect(uploadForm).toBeVisible();
      const uploadColumns = await uploadForm.evaluate(node =>
        getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
      expect(uploadColumns, `document import controls at ${width}px`)
        .toBe(width === 360 ? 1 : 2);
      const uploadLabelWidth = await uploadForm.locator("label:has(#document-file)").evaluate(node =>
        node.getBoundingClientRect().width);
      expect(uploadLabelWidth).toBeGreaterThanOrEqual(width === 360 ? 120 : 180);

      // REC-UI-DOC-008: prioritize the usable archive on 360px screens
      // instead of repeating desktop trust badges above the import form.
      const archiveLink = page.getByRole("link", { name: "Ir al archivo documental ↓" });
      if (width === 360) {
        await expect(archiveLink).toBeVisible();
        await expect(page.getByText("Original privado", { exact: true })).toBeHidden();
        await archiveLink.click();
        await expect(page).toHaveURL(/#archivo-documental$/);
        await expect(page.locator("#archivo-documental")).toBeVisible();
      } else {
        await expect(archiveLink).toBeHidden();
        await expect(page.getByText("Original privado", { exact: true })).toBeVisible();
      }
      // REC-UI-DOC-007: real browser contrast, including disabled vs enabled
      // phases. The previous light theme used dark-on-dark colors for Drive.
      const driveAction = page.getByTestId("drive-auto-sync").getByRole("button", { name: "Comprobar ahora" });
      await expect(driveAction).toBeVisible();
      const textContrast = await driveAction.evaluate((node) => {
        const style = getComputedStyle(node);
        const rgb = (color: string) => {
          const channels = color.match(/(?:\d+\.\d+|\d+)/g)?.slice(0, 3).map(Number) ?? [];
          return color.startsWith("color(") ? channels.map(value => value * 255) : channels;
        };
        const lum = (values: number[]) => {
          const normalized = values.map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722;
        };
        const fore = rgb(style.color);
        const back = rgb(style.backgroundColor);
        if (fore.length !== 3 || back.length !== 3) return 0;
        const f = lum(fore);
        const b = lum(back);
        return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
      });
      expect(textContrast, `REC-UI-DOC-007 Drive action contrast in ${theme} at ${width}px`).toBeGreaterThanOrEqual(4.5);
      await expect(page.getByText(items[0].originalFileName).first()).toBeVisible();
      const selectedRow = page.getByRole("button", { name: /Factura detallada de suministros de septiembre 2026/ });
      await selectedRow.click();
      await expect(page.getByRole("heading", { name: items[0].originalFileName })).toBeVisible();
      await expect(selectedRow).toContainText("12/09/2026");
      await expect(page.locator('input[type="date"]')).toHaveValue(items[0].documentDate);
      await expect(page.locator("form output")).toHaveText("12/09/2026");
      // REC-UI-DOC-006: narrow list panels must not collapse the filename to
      // one letter because status, file icon and metadata claim three columns.
      const filenameStyle = await selectedRow.locator("strong").first().evaluate(node => ({
        clamp: getComputedStyle(node).webkitLineClamp,
        whiteSpace: getComputedStyle(node).whiteSpace,
      }));
      expect(filenameStyle.clamp).toBe("2");
      expect(filenameStyle.whiteSpace).toBe("normal");
      if (width === 360) {
        const jump = page.getByRole("link", { name: "Ir a la ficha seleccionada ↓" });
        await expect(jump).toBeVisible();
        await jump.click();
        await expect(page).toHaveURL(/#documento-seleccionado$/);
        await expect(page.locator("#documento-seleccionado")).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "Revisar con OCR" })).toBeVisible();
      const flow = page.getByRole("list", { name: "Proceso de revisión OCR" });
      const firstStage = flow.locator("li").first();
      await expect(firstStage).toBeVisible();
      // Desktop's split detail panel is only about 500px even at a
      // 1366px viewport: four tiny columns passed no-overflow/axe while
      // splitting words into 2-3 characters. Require readable card widths.
      const stageBox = await firstStage.boundingBox();
      expect(stageBox?.width ?? 0).toBeGreaterThanOrEqual(170);
      const actualColumns = await flow.evaluate((node) =>
        getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
      expect(actualColumns).toBe(width === 360 ? 1 : 2);
      await noOverflow(page, width);
      const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(a11y.violations.map(v => ({
        id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })),
      }))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`populated-documents-${theme}-${width}.png`), fullPage: true });
    });
  }
}

for (const width of [360, 820, 1366]) {
  test(`REC-UI · buscador abierto y teclado a ${width}px`, async ({ page }) => {
    await mockRecoveryHome(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Buscar en Financial App", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Encuentra cualquier cosa" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await expect(page.getByRole("combobox", { name: "Buscar en Financial App" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Cerrar buscador" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
