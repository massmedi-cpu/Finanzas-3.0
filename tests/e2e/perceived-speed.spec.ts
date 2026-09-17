import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Las transiciones de ruta ofrecen feedback inmediato, discreto y accesible", () => {
  const loading = source("app/loading.tsx");
  const css = source("app/loading.module.css");

  expect(loading).toContain('role="status"');
  expect(loading).toContain('aria-live="polite"');
  expect(loading).toContain("Cargando la siguiente sección…");
  expect(loading).not.toContain("Cargando tus datos");
  expect(loading).not.toContain("Estamos preparando la información necesaria para esta pantalla.");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  expect(css).toContain("grid-template-columns: 1fr");
});

test("Inicio prioriza información útil antes de las fuentes secundarias", () => {
  const overview = source("app/inicio-overview.tsx");

  expect(overview).toContain('await loadScope("primary", ["financial", "transactions"])');
  expect(overview).toContain("setPrimaryLoading(false)");
  expect(overview).toContain('loadScope("secondary", ["monthly", "budgets", "forecast"])');
  expect(overview).toContain('`/api/dashboard?scope=${scope}`');
  expect(overview).toContain("5_000");
  expect(overview).toContain("className={styles.skeleton}");
  expect(overview).toContain("aria-busy={primaryLoading || secondaryLoading}");
});

test("La mejora de velocidad percibida no crea llamadas financieras adicionales", () => {
  const loading = source("app/loading.tsx");
  expect(loading).not.toContain("fetch(");
  expect(loading).not.toContain("/api/");
});
