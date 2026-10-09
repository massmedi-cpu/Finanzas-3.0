import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
let passes = 0;
function check(clause, description, condition) {
  if (condition) { passes += 1; console.log(`PASS ${clause} · ${description}`); }
  else failures.push(`FAIL ${clause} · ${description}`);
}
function hasAll(text, values) { return values.every((value) => text.includes(value)); }

const globals = read("app/globals.css");
const categoryVisuals = read("src/domain/category-visuals.ts");
const categoryGlyph = read("src/ui/category-glyph.tsx");
const categoryIdentity = read("app/category-identity.tsx");
const shell = read("app/app-shell.tsx");
const feedback = read("app/action-feedback.tsx");
const contribution = read("src/design/contribution-chart.tsx");
const trend = read("src/design/financial-trend-chart.tsx");
const forecastChart = read("src/design/forecast-balance-chart.tsx");
const surfaces = [
  "app/inicio-overview.tsx",
  "app/transactions/transactions-client.tsx",
  "app/budgets/budgets-client.tsx",
  "app/analysis/analysis-client.tsx",
  "app/forecast/forecast-client.tsx",
  "app/documents/documents-client.tsx",
  "src/design/contribution-chart.tsx",
].map((path) => [path, read(path)]);

check("§62", "dirección visual oscura y superficies coherentes", hasAll(globals, ["color-scheme: dark", "--color-bg:", "--color-surface:", "--radius-panel:"]));
check("§63", "sistema semántico de color central", hasAll(globals, ["--color-primary:", "--color-success:", "--color-warning:", "--color-danger:"]));
check("§64", "catálogo único de color e icono de categoría", categoryVisuals.includes("CATEGORY_ICON_OPTIONS") && categoryVisuals.includes("CATEGORY_COLOR_OPTIONS") && categoryGlyph.includes("data-category-icon"));
check("§64", "identidad visual resuelta desde Configuración sin inventar valores", categoryIdentity.includes('/api/category-identity') && categoryIdentity.includes("categoryColorHex") && categoryIdentity.includes("data-category-color-token"));
for (const [path, source] of surfaces) check("§64", `identidad de categoría propagada: ${path}`, source.includes("CategoryIdentity") || path.includes("contribution-chart"));
check("§65", "iconografía vectorial coherente", categoryGlyph.includes("<svg") && read("src/design/product-icons.tsx").includes("export function ProductIcon"));
check("§66", "tarjetas y paneles usan sistema estable de radios/superficies", hasAll(globals, ["--radius-md:", "--radius-lg:", "--radius-panel:", "--shadow-panel:"]));
check("§67", "gráficos principales mantienen contratos accesibles", [contribution, trend, forecastChart].every((source) => source.includes("aria-label") || source.includes('role="img"')));
check("§68", "jerarquía visual con títulos y contenido principal accesible", shell.includes('href="#main-content"') && shell.includes('id="main-content"') && globals.includes("--font-page-title:"));
check("§69", "sistema tipográfico único centralizado", hasAll(globals, ["--font-page-title:", "--font-section-title:", "--font-kpi-primary:", "--font-body:", "--font-label:", "--font-helper:"]));
// Supporting text was increased to 14px. The guard must not mandate an older 13px token.
const helperMatch = globals.match(/--font-helper:\s*([0-9.]+)rem/);
const helperRem = helperMatch ? Number(helperMatch[1]) : 0;
check("§70", "body at 16px and supporting text at least 14px",
  /--font-body:\s*1rem\b/.test(globals) && helperRem >= 0.875 && helperRem <= 1);
check("§71", "feedback y navegación conservan patrones globales estables", feedback.includes("pending") && feedback.includes("success") && feedback.includes("error") && shell.includes('aria-label="Navegación principal"'));

console.log(`Axioma §§62–71 · evidencia objetiva: ${passes} PASS, ${failures.length} FAIL`);
if (failures.length) { failures.forEach((failure) => console.error(failure)); process.exit(1); }
console.log("PASS · El gate no sustituye juicio humano sobre calma visual, densidad, belleza, pertinencia contextual o facilidad de escaneado.");
