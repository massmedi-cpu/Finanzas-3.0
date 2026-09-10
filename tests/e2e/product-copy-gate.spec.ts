import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/onboarding",
  "/review",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/recurrences",
  "/documents",
  "/configuration",
  "/configuration/source",
  "/configuration/data",
] as const;

test("las superficies principales no muestran lenguaje de fases ni navegación de desarrollo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la gate de copy se ejecuta una vez por run");

  const violations: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    await page.locator("body").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 15_000 }).catch(() => undefined);

    const text = await page.locator("body").innerText();
    const phaseMatches = text.match(/\bFASE\s+\d+\b/gi) ?? [];
    if (phaseMatches.length) violations.push(`${route}: ${[...new Set(phaseMatches)].join(", ")}`);
    if (/←\s*Fundamentos\b/i.test(text)) violations.push(`${route}: ← Fundamentos`);
  }

  expect(violations).toEqual([]);
});
