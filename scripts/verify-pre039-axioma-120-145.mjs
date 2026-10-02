import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const fail = [];
const ok = [];

function requiredFile(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    fail.push(`Falta archivo requerido: ${path}`);
    return;
  }
  ok.push(`archivo: ${path}`);
}

function requiredText(path, needle, label = needle) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    fail.push(`No se puede validar ${label}: falta ${path}`);
    return;
  }
  const source = readFileSync(absolute, "utf8");
  if (!source.includes(needle)) {
    fail.push(`Falta contrato ${label} en ${path}`);
    return;
  }
  ok.push(`contrato: ${label}`);
}

const requiredFiles = [
  "tests/e2e/extreme-financial-edge-cases-10.0.32.spec.ts",
  "tests/e2e/extreme-financial-scenarios.spec.ts",
  "tests/e2e/analysis-history-integrity.spec.ts",
  "tests/e2e/safe-reversible-edits.spec.ts",
  "tests/e2e/recurrences.spec.ts",
  "tests/e2e/responsive-matrix-10.0.49.spec.ts",
  ".github/workflows/extreme-financial-edge-cases.yml",
  ".github/workflows/quality-edge-ci-gates-10.0.41.yml",
  "docs/audits/pre039-axioma-120-145-certification-20261002.md",
  ".github/workflows/pre039-axioma-120-145.yml",
];

for (const file of requiredFiles) requiredFile(file);

requiredText(
  "package.json",
  '"verify:pre039": "node scripts/verify-pre039-axioma-120-145.mjs"',
  "script npm verify:pre039",
);
requiredText(
  ".github/workflows/pre039-axioma-120-145.yml",
  "npm run verify:pre039",
  "workflow ejecuta verify:pre039",
);
requiredText(
  ".github/workflows/pre039-axioma-120-145.yml",
  "npm run typecheck",
  "workflow ejecuta typecheck",
);
requiredText(
  ".github/workflows/pre039-axioma-120-145.yml",
  "npm run build",
  "workflow ejecuta build",
);
requiredText(
  "tests/e2e/extreme-financial-edge-cases-10.0.32.spec.ts",
  "duplicados confirmados no contaminan analítica",
  "duplicados financieros aislados",
);
requiredText(
  "tests/e2e/extreme-financial-scenarios.spec.ts",
  "evita divisiones artificiales cuando el periodo no tiene ingresos",
  "periodo sin ingresos no divide artificialmente",
);

for (let section = 120; section <= 145; section += 1) {
  requiredText(
    "docs/audits/pre039-axioma-120-145-certification-20261002.md",
    `| ${section} |`,
    `mapeo Axioma §${section}`,
  );
}

console.log(`PRE-039 · comprobaciones estáticas correctas: ${ok.length}`);

if (fail.length) {
  console.error("PRE-039 · NO LISTO para certificación runtime:");
  for (const error of fail) console.error(`- ${error}`);
  process.exit(1);
}

console.log("PRE-039 · puerta estática LISTA.");
console.log("Nota: esta puerta NO sustituye la ejecución runtime, CI, validación UX real, revisión final de logs ni smoke de producción exigidos por §§140, 142 y 144.");
