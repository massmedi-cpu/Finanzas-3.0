import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), "app", file), "utf8");

test("Movimientos uses theme semantics for the batch panel and native selection controls", () => {
  const css = read("transactions/transactions.module.css");
  expect(css).not.toContain("rgba(24, 50, 99, .72)");
  expect(css).not.toContain("accent-color: #4d8dff");
  expect(css).toContain("color-mix(in srgb, var(--color-primary) 14%, var(--surface-card))");
  expect(css).toContain("accent-color: var(--color-primary-bright)");
});

test("Documentos maintains light-mode surfaces and focus through common tokens", () => {
  const css = read("documents/documents.module.css");
  for (const color of ["#8fb5ff", "#1f6bff", "#1857d8", "#f1f5fc", "background: #fff;"]) {
    expect(css, color).not.toContain(color);
  }
  expect(css).toContain("var(--color-surface-strong)");
  expect(css).toContain("outline:2px solid var(--color-primary-bright)");
});

test("Analisis skeleton preserves both themes without fixed dark shimmer", () => {
  const css = read("analysis/analysis.module.css");
  expect(css).not.toContain("rgba(26, 43, 75, 0.7)");
  expect(css).toContain("color-mix(in srgb, var(--color-primary) 9%, var(--surface-card))");
});
