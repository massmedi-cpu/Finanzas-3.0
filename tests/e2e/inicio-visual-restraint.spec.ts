import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
const polishSource = readFileSync(
  resolve(process.cwd(), "app/home-audit.module.css"),
  "utf8",
);
const dashboardSource = readFileSync(
  resolve(process.cwd(), "app/dashboard-client.tsx"),
  "utf8",
);

function maxClampRem(token: string) {
  const match = polishSource.match(
    new RegExp(`${token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:\\s*clamp\\([^;]*,\\s*([0-9.]+)rem\\s*\\);`),
  );
  return match ? Number(match[1]) : Number.NaN;
}

test("Inicio · la jerarquía visual queda contenida y aislada del resto de la app", async () => {
  expect(pageSource).toContain('import styles from "./home-audit.module.css"');
  expect(pageSource).toContain("<div className={styles.scope}>");
  expect(polishSource).toContain("display: contents");

  expect(maxClampRem("--font-page-title")).toBeLessThanOrEqual(1.65);
  expect(maxClampRem("--font-section-title")).toBeLessThanOrEqual(1.22);
  expect(maxClampRem("--font-kpi-primary")).toBeLessThanOrEqual(1.62);
  expect(maxClampRem("--font-kpi-secondary")).toBeLessThanOrEqual(1.18);

  expect(polishSource).not.toMatch(/!important/i);
  expect(polishSource).not.toMatch(/backdrop-filter/i);
  expect(polishSource).not.toMatch(/font-size\s*:/i);
});

test("Inicio · conserva privacidad y cabeceras sin descripciones ornamentales", async () => {
  expect(dashboardSource).toContain('const PRIVACY_KEY = "financial-app:home-amounts"');
  expect(dashboardSource).toContain('aria-label={revealAmounts ? "Ocultar importes" : "Mostrar importes"}');

  const panelHeaders = [...dashboardSource.matchAll(/<div className=\{styles\.panelHeader\}>([\s\S]*?)<\/div>\s*(?:\{financial|\{monthly|\{budgets|\{forecast|\{transactions)/g)];
  expect(panelHeaders.length).toBeGreaterThanOrEqual(5);
  for (const header of panelHeaders) {
    expect(header[1]).not.toMatch(/<p[\s>]/i);
  }
});
