import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const globals = read("app/globals.css");
const appShell = read("app/app-shell.tsx");
const navigation = read("app/navigation-items.ts");
const guardedStyles = new Map([
  ["app/globals.css", globals],
  ["app/app-shell.module.css", read("app/app-shell.module.css")],
  ["app/forecast/forecast-horizon-panel.module.css", read("app/forecast/forecast-horizon-panel.module.css")],
  ["app/configuration/source/source-overview.module.css", read("app/configuration/source/source-overview.module.css")],
  ["app/configuration/source/source.module.css", read("app/configuration/source/source.module.css")],
]);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const helperMatch = globals.match(/--font-helper:\s*([0-9.]+)rem\s*;/);
assert(helperMatch, "Falta el token global --font-helper.");

const helperRem = helperMatch ? Number(helperMatch[1]) : 0;
assert(helperRem >= 0.875, `--font-helper no puede ser inferior a 0.875rem; actual=${helperRem}rem.`);
assert(globals.includes("--font-family-ui:"), "Falta el token --font-family-ui.");
assert(globals.includes("font-family: var(--font-family-ui);"), "body debe consumir --font-family-ui.");
assert(!/--font-family-ui:[^;]*\bInter\b/i.test(globals), "La familia UI no debe prometer Inter si no se carga de forma explícita.");

for (const [path, css] of guardedStyles) {
  const literalFontSizes = [...css.matchAll(/font-size:\s*([0-9]*\.?[0-9]+)rem\s*;/g)]
    .map((match) => ({ value: Number(match[1]), declaration: match[0] }))
    .filter(({ value }) => value > 0 && value < helperRem);

  assert(
    literalFontSizes.length === 0,
    `${path} contiene tamaños de fuente por debajo de --font-helper (${helperRem}rem): ${literalFontSizes.map(({ declaration }) => declaration).join(", ")}`,
  );
}

for (const selector of [".panel-kicker", ".status-chip, .lifecycle", ".field-hint", ".config-tabs button span"]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = globals.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "m"))?.[0] ?? "";
  assert(block.includes("font-size: var(--font-helper)"), `${selector} debe usar --font-helper.`);
}

assert(
  globals.includes(".premium-primary-nav [data-nav-href] { font-size: var(--font-helper); }"),
  "La navegación principal debe impedir reducciones por debajo de --font-helper.",
);

const forecastStyles = guardedStyles.get("app/forecast/forecast-horizon-panel.module.css") ?? "";
const forecastEyebrow = forecastStyles.match(/\.eyebrow\s*\{[^}]*\}/m)?.[0] ?? "";
assert(forecastEyebrow.includes("font-size: var(--font-helper)"), "El kicker de horizontes debe usar --font-helper.");

assert(!navigation.includes("/net-worth"), "PRE-019: Patrimonio permanece fuera de la navegación.");
assert(!existsSync(resolve(root, "app/net-worth/page.tsx")), "PRE-019: no debe reaparecer la ruta patrimonial excluida.");

const prefetchBlock = appShell.match(/const HIGH_VALUE_PREFETCH_ROUTES = \[[\s\S]*?\] as const;/)?.[0] ?? "";
assert(!prefetchBlock.includes('"/net-worth"'), "PRE-019: no se debe precargar una ruta patrimonial excluida.");

if (failures.length) {
  console.error("Premium design system guard: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Premium design system guard: OK");
console.log(`- helper mínimo: ${helperRem}rem`);
console.log("- fuente UI explícita: system-ui");
console.log(`- módulos tipográficos protegidos: ${guardedStyles.size}`);
console.log("- navegación principal protegida contra reducción tipográfica");
console.log("- Previsión protegida tipográficamente; Patrimonio excluido conforme a PRE-019");
