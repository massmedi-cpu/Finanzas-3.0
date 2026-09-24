import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("UI · la jerarquía compacta se aplica globalmente y conserva ayudas funcionales", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de fuente visual se mide una vez por run");

  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  const density = readFileSync(join(root, "app/visual-density.css"), "utf8");

  expect(layout).toContain('import "./visual-density.css";');

  for (const token of [
    "--font-page-title",
    "--font-section-title",
    "--font-kpi-primary",
    "--font-kpi-secondary",
  ]) {
    expect(density, `visual-density.css debe redefinir ${token}`).toContain(token);
  }

  expect(density).not.toMatch(/header\[class\*=["']__hero["']\][^{]*\{[^}]*display\s*:\s*none/is);
  expect(density).not.toMatch(/\.configuration-hero\s+\.hero-copy[^{]*\{[^}]*display\s*:\s*none/is);
  expect(density).toContain('[class*="__heroBalance"] strong');
  expect(density).toContain('[class*="__totalCard"] strong');

  expect(density).not.toContain('[class*="_hero__"]');
  expect(density).not.toContain('[class*="_heroBalance__"]');

  expect(density).toContain("@media (max-width: 48rem)");
  expect(density).toContain("@media (max-width: 30rem)");

  expect(density).not.toMatch(/main\s+p\s*\{[^}]*display\s*:\s*none/is);
  expect(density).not.toMatch(/\[role=["'](?:alert|status)["']\][^{]*\{[^}]*display\s*:\s*none/is);
});
