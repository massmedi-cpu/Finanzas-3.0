import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const tokensPath = "app/semantic-tokens.css";
const tokens = read(tokensPath);
const layout = read("app/layout.tsx");
const guarded = new Map([
  ["app/net-worth/net-worth.module.css", read("app/net-worth/net-worth.module.css")],
  ["app/configuration/source/source-overview.module.css", read("app/configuration/source/source-overview.module.css")],
  ["app/configuration/source/source.module.css", read("app/configuration/source/source.module.css")],
]);

const requiredTokens = [
  "--surface-card",
  "--surface-card-muted",
  "--surface-empty",
  "--surface-info-soft",
  "--surface-success-soft",
  "--surface-warning-soft",
  "--border-card",
  "--border-card-accent",
  "--border-info-soft",
  "--border-success-soft",
  "--border-warning-soft",
  "--text-on-strong",
  "--text-success-soft",
  "--text-warning-soft",
  "--radius-card",
  "--radius-card-compact",
  "--radius-item",
];

for (const token of requiredTokens) {
  assert(tokens.includes(`${token}:`), `Falta el token semántico ${token}.`);
}

const globalsImport = layout.indexOf('import "./globals.css";');
const semanticImport = layout.indexOf('import "./semantic-tokens.css";');
assert(globalsImport >= 0, "layout.tsx debe seguir cargando globals.css.");
assert(semanticImport > globalsImport, "semantic-tokens.css debe cargarse después de globals.css.");

const rawColorPattern = /#[0-9a-f]{3,8}\b|rgba?\s*\(/gi;
for (const [path, css] of guarded) {
  const literals = [...css.matchAll(rawColorPattern)].map((match) => match[0]);
  assert(literals.length === 0, `${path} contiene colores literales fuera del contrato semántico: ${literals.join(", ")}`);
  assert(css.includes("var(--"), `${path} debe consumir variables CSS.`);
}

const netWorth = guarded.get("app/net-worth/net-worth.module.css") ?? "";
assert(netWorth.includes("var(--surface-card)"), "Patrimonio debe consumir --surface-card.");
assert(netWorth.includes("var(--border-card)"), "Patrimonio debe consumir --border-card.");
assert(netWorth.includes("var(--radius-card)"), "Patrimonio debe consumir --radius-card.");

const sourceOverview = guarded.get("app/configuration/source/source-overview.module.css") ?? "";
assert(sourceOverview.includes("var(--surface-info-soft)"), "Fuente simple debe consumir --surface-info-soft.");
assert(sourceOverview.includes("var(--surface-warning-soft)"), "Fuente simple debe consumir --surface-warning-soft.");

const sourceDiagnostics = guarded.get("app/configuration/source/source.module.css") ?? "";
assert(sourceDiagnostics.includes("var(--surface-success-soft)"), "Diagnóstico de Fuente debe consumir --surface-success-soft.");
assert(sourceDiagnostics.includes("var(--surface-card-muted)"), "Diagnóstico de Fuente debe consumir --surface-card-muted.");

if (failures.length) {
  console.error("Semantic design token guard: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Semantic design token guard: OK");
console.log(`- tokens semánticos obligatorios: ${requiredTokens.length}`);
console.log(`- superficies protegidas contra colores literales: ${guarded.size}`);
console.log("- Patrimonio + Fuente simple + Diagnóstico consumen el contrato ART-001");
