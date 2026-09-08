import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const legacyTokenFile = join(root, "src/design/tokens.ts");
const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    const extension = entry.slice(entry.lastIndexOf("."));
    return codeExtensions.has(extension) ? [fullPath] : [];
  });
}

function normalise(path: string) {
  return path.replaceAll("\\", "/");
}

test("D1 · los tokens semánticos tienen una única fuente canónica", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de fuente visual se mide una vez por run");

  const globalsCss = readFileSync(join(root, "app/globals.css"), "utf8");
  for (const token of [
    "--color-bg",
    "--color-surface",
    "--color-border",
    "--color-text",
    "--color-text-secondary",
    "--color-primary",
    "--color-success",
    "--color-danger",
    "--focus-ring",
  ]) {
    expect(globalsCss, `app/globals.css debe definir ${token}`).toContain(token);
  }

  const references = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "src"))]
    .filter((file) => file !== legacyTokenFile)
    .flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const importsLegacyTokens = /(?:from\s+["'][^"']*design\/tokens["']|import\s*["'][^"']*design\/tokens["']|require\(\s*["'][^"']*design\/tokens["']\s*\))/m.test(content);
      return importsLegacyTokens ? [normalise(relative(root, file))] : [];
    });

  expect(references, "ningún código de producto debe consumir la fuente TS paralela de tokens").toEqual([]);
  expect(
    existsSync(legacyTokenFile),
    "src/design/tokens.ts duplica el contrato visual y debe desaparecer cuando se confirme que no tiene consumidores",
  ).toBe(false);
});
