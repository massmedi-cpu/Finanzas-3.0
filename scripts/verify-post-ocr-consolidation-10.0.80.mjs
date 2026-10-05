import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const exists = (path) => fs.existsSync(path);
const failures = [];

function requireFile(path) {
  if (!exists(path)) failures.push(`Falta ${path}`);
}

function requireText(path, needles) {
  requireFile(path);
  if (!exists(path)) return;
  const text = read(path);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${path}: falta contrato ${needle}`);
  }
}

function versionAtLeast(actual, minimum) {
  const parse = (value) => String(value ?? "").split(".").map((part) => Number.parseInt(part, 10));
  const a = parse(actual);
  const b = parse(minimum);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((part) => Number.isNaN(part))) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
if (!versionAtLeast(pkg.version, "10.0.80")) failures.push(`package.json debe declarar 10.0.80+ y declara ${pkg.version}`);
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  failures.push("package-lock.json debe compartir la identidad de package.json");
}

requireText("src/core/build-info.ts", [
  "export const CURRENT_PHASE = 13 as const;",
  "export const CURRENT_PHASE_BLOCK = 2 as const;",
  'export const CURRENT_PHASE_BLOCK_NAME = "Certificación integral post-OCR, coherencia y cierre" as const;',
  "export const APP_VERSION = packageJson.version;",
]);

const modernGates = [
  "scripts/verify-analysis-axioma53-10.0.74.mjs",
  "scripts/verify-forecast-phase7-10.0.75.mjs",
  "scripts/verify-configuration-phase8-10.0.76.mjs",
  "scripts/verify-home-phase9-10.0.77.mjs",
  "scripts/verify-transversals-phase10-10.0.78.mjs",
  "scripts/verify-ocr-phase11-10.0.79.mjs",
];
for (const path of modernGates) requireFile(path);

requireText("scripts/verify-ocr-phase11-10.0.79.mjs", [
  "function versionAtLeast(actual, minimum)",
  'versionAtLeast(pkg.version, "10.0.79")',
  "OCR Fase 11 / 10.0.79+ certificada",
]);

for (const path of [
  ".github/workflows/release-identity.yml",
  ".github/workflows/sync-missing-persistence.yml",
  ".github/workflows/cross-module-financial-consistency.yml",
  ".github/workflows/responsive-matrix-10.0.49.yml",
  ".github/workflows/ocr-phase11-10.0.79.yml",
  "tests/e2e/sync-missing-persistence-contract.spec.ts",
  "tests/e2e/cross-module-financial-consistency.spec.ts",
  "tests/e2e/responsive-matrix-10.0.49.spec.ts",
  "tests/e2e/document-ocr-review-quality-10.0.79.spec.ts",
]) requireFile(path);

const postbuild = String(pkg.scripts?.postbuild || "");
for (const gate of [...modernGates, "scripts/verify-post-ocr-consolidation-10.0.80.mjs"]) {
  if (!postbuild.includes(gate)) failures.push(`postbuild no conserva ${gate}`);
}

if (failures.length) {
  console.error("Consolidación post-OCR 10.0.80 NO certificada:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Consolidación post-OCR 10.0.80+ certificada: identidad, cadena funcional moderna, persistencia, coherencia financiera, responsive y OCR permanecen bajo contrato acumulativo.");
