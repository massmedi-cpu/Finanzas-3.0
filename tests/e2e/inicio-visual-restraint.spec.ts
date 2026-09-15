import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
const polishSource = readFileSync(resolve(process.cwd(), "app/home-audit.module.css"), "utf8");
const inicioSource = readFileSync(resolve(process.cwd(), "app/inicio-client.tsx"), "utf8");
const inicioCss = readFileSync(resolve(process.cwd(), "app/inicio.module.css"), "utf8");

function maxClampRem(token: string) {
  const match = polishSource.match(
    new RegExp(`${token}:\\s*clamp\\([^;]*,\\s*([0-9.]+)rem\\s*\\);`),
  );
  return match ? Number(match[1]) : Number.NaN;
}

test("Inicio · la jerarquía visual queda contenida y aislada del resto de la app", () => {
  expect(pageSource).toContain('import InicioClient from "./inicio-client"');
  expect(pageSource).toContain('import styles from "./home-audit.module.css"');
  expect(pageSource).toContain("<div className={styles.scope}>");
  expect(polishSource).toContain("display: contents");

  expect(maxClampRem("--font-page-title")).toBeLessThanOrEqual(1.65);
  expect(maxClampRem("--font-section-title")).toBeLessThanOrEqual(1.22);
  expect(maxClampRem("--font-kpi-primary")).toBeLessThanOrEqual(1.62);
  expect(maxClampRem("--font-kpi-secondary")).toBeLessThanOrEqual(1.18);

  expect(polishSource).not.toMatch(/!important/i);
  expect(inicioCss).not.toMatch(/!important/i);
  expect(inicioCss).not.toMatch(/backdrop-filter/i);
});

test("Inicio · conserva privacidad y evita un único saldo dominante", () => {
  expect(inicioSource).toContain('const PRIVACY_KEY = "financial-app:home-amounts"');
  expect(inicioSource).toContain('aria-label={revealAmounts ? "Ocultar importes" : "Mostrar importes"}');
  expect(inicioSource).toContain('className={styles.summary}');
  expect(inicioSource).toContain("Disponible");
  expect(inicioSource).toContain("Ingresos del mes");
  expect(inicioSource).toContain("Gastos del mes");
  expect(inicioSource).toContain("Balance del mes");
  expect(inicioSource).toContain("Tasa de ahorro");
  expect(inicioSource).not.toContain("balanceSummary");
});
