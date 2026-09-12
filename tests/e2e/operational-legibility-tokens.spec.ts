import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function readCss(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("Movimientos mantiene los rótulos de jerarquía en el mínimo helper de 13 px", async () => {
  const css = readCss("app/transactions/transactions.module.css");
  expect(css).toMatch(/\.eyebrow\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.kicker\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
});

test("Recurrentes usa tokens legibles en métricas, badges y detalle funcional", async () => {
  const css = readCss("app/recurrences/recurrences.module.css");
  expect(css).toMatch(/\.eyebrow\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.metric span\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.metric small\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.readOnlyBadge,\s*\.confidence,\s*\.statusBadge\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.details dt\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.details dd\s*\{[^}]*font-size:\s*var\(--font-label\)/s);
  expect(css).toMatch(/\.explanation\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
});

test("Inicio mantiene la información auxiliar y de jerarquía en al menos 13 px", async () => {
  const css = readCss("app/dashboard.module.css");
  expect(css).toMatch(/\.eyebrow,\s*\.kicker\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.heroBalance small\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.accountRow span,\s*\.futureRow span,\s*\.transactionRow span\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.panelFoot\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.legend\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(css).toMatch(/\.footerNote\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
});

test("Para revisar y Previsión mantienen su jerarquía visual en el token helper", async () => {
  const reviewCss = readCss("app/review/review.module.css");
  const forecastCss = readCss("app/forecast/forecast.module.css");
  expect(reviewCss).toMatch(/\.eyebrow\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
  expect(forecastCss).toMatch(/\.eyebrow\s*\{[^}]*font-size:\s*var\(--font-helper\)/s);
});
