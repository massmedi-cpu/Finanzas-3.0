import { expect, test } from "@playwright/test";

const ROUTES = [
  "/login",
  "/",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/recurrences",
  "/documents",
  "/configuration",
  "/configuration/source",
] as const;

const AXIOM_VIEWPORTS = [
  { name: "móvil pequeño", width: 360, height: 800 },
  { name: "móvil habitual", width: 430, height: 900 },
  { name: "móvil grande", width: 480, height: 900 },
  { name: "tablet vertical", width: 768, height: 1024 },
  { name: "tablet horizontal", width: 1024, height: 768 },
  { name: "portátil", width: 1280, height: 800 },
  { name: "escritorio", width: 1440, height: 900 },
] as const;

async function auditRenderedSurface(page: import("@playwright/test").Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response, `${route} debe devolver una respuesta de documento`).not.toBeNull();
  expect(response!.status(), `${route} no debe devolver un 5xx`).toBeLessThan(500);

  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  const audit = await page.evaluate(() => {
    const visible = (element: Element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && box.width > 0 && box.height > 0;
    };

    const textFromIdRefs = (value: string | null) =>
      (value ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();

    const hasAccessibleName = (element: Element) => {
      const node = element as HTMLElement;
      const ariaLabel = node.getAttribute("aria-label")?.trim() ?? "";
      const labelledBy = textFromIdRefs(node.getAttribute("aria-labelledby"));
      const title = node.getAttribute("title")?.trim() ?? "";
      const ownText = node.textContent?.trim() ?? "";
      if (ariaLabel || labelledBy || title || ownText) return true;

      if (node instanceof HTMLInputElement) {
        if (["submit", "button", "reset"].includes(node.type) && node.value.trim()) return true;
        if (node.labels && Array.from(node.labels).some((label) => (label.textContent?.trim() ?? "").length > 0)) return true;
      }
      if (node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) {
        if (node.labels && Array.from(node.labels).some((label) => (label.textContent?.trim() ?? "").length > 0)) return true;
      }
      return false;
    };

    const interactiveSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([type='hidden']):not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "summary",
      "[role='button']",
      "[role='link']",
    ].join(",");

    const interactive = Array.from(document.querySelectorAll(interactiveSelector)).filter(visible);
    const unnamed = interactive
      .filter((element) => !hasAccessibleName(element))
      .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`);

    const imagesWithoutAlt = Array.from(document.querySelectorAll("img"))
      .filter(visible)
      .filter((element) => !element.hasAttribute("alt"))
      .map((element) => element.getAttribute("src") ?? "img");

    const touchTargetsTooSmall = window.innerWidth <= 480
      ? interactive
          .filter((element) => {
            const box = (element as HTMLElement).getBoundingClientRect();
            return box.height < 44;
          })
          .map((element) => {
            const node = element as HTMLElement;
            return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}:${Math.round(node.getBoundingClientRect().height)}px`;
          })
      : [];

    const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;

    return { unnamed, imagesWithoutAlt, touchTargetsTooSmall, horizontalOverflow };
  });

  expect(audit.unnamed, `${route}: todos los controles visibles deben tener nombre accesible`).toEqual([]);
  expect(audit.imagesWithoutAlt, `${route}: todas las imágenes visibles deben definir alt`).toEqual([]);
  expect(audit.touchTargetsTooSmall, `${route}: los controles táctiles visibles deben medir al menos 44 px de alto`).toEqual([]);
  expect(audit.horizontalOverflow, `${route}: no puede existir overflow horizontal global`).toBe(false);

  const focusableCount = await page.locator("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])").count();
  if (focusableCount > 0) {
    let focusIsVisible = false;
    for (let attempt = 0; attempt < Math.min(focusableCount, 8); attempt += 1) {
      await page.keyboard.press("Tab");
      focusIsVisible = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active === document.body) return false;
        const style = getComputedStyle(active);
        const hasOutline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth || "0") > 0;
        const hasShadow = style.boxShadow !== "none" && style.boxShadow !== "";
        return hasOutline || hasShadow;
      });
      if (focusIsVisible) break;
    }
    expect(focusIsVisible, `${route}: la navegación por teclado debe mostrar focus visible`).toBe(true);
  }
}

test("Axioma: matriz responsive y accesibilidad básica cubren todas las superficies principales", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la matriz completa se ejecuta una sola vez por run");
  test.setTimeout(300_000);

  for (const viewport of AXIOM_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of ROUTES) {
      await test.step(`${viewport.name} · ${route}`, async () => {
        await auditRenderedSurface(page, route);
      });
    }
  }
});

test("Axioma: los tokens globales de texto mantienen contraste WCAG AA sobre el fondo base", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la puerta de contraste global se ejecuta una sola vez por run");
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const failures = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const background = root.getPropertyValue("--color-bg").trim();
    const tokenNames = [
      "--color-text",
      "--color-text-secondary",
      "--color-text-muted",
      "--color-primary-bright",
      "--color-cyan",
      "--color-success",
      "--color-warning",
      "--color-danger",
    ];

    const parseHex = (value: string) => {
      const match = value.match(/^#([0-9a-f]{6})$/i);
      if (!match) return null;
      const raw = match[1];
      return [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255);
    };
    const luminance = (value: string) => {
      const rgb = parseHex(value);
      if (!rgb) return null;
      const linear = rgb.map((component) => component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const bgLum = luminance(background);
    if (bgLum === null) return [`--color-bg no es un color hexadecimal verificable: ${background}`];

    return tokenNames.flatMap((token) => {
      const value = root.getPropertyValue(token).trim();
      const fgLum = luminance(value);
      if (fgLum === null) return [`${token} no es un color hexadecimal verificable: ${value}`];
      const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
      return ratio >= 4.5 ? [] : [`${token} = ${value} tiene contraste ${ratio.toFixed(2)}:1 sobre ${background}`];
    });
  });

  expect(failures).toEqual([]);
});
