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
  "tests/e2e/navigation-performance-10.0.30.spec.ts",
  "tests/e2e/extreme-financial-edge-cases-10.0.32.spec.ts",
  "tests/e2e/extreme-financial-scenarios.spec.ts",
  "tests/e2e/analysis-history-integrity.spec.ts",
  "tests/e2e/safe-reversible-edits.spec.ts",
  "tests/e2e/recurrences.spec.ts",
  "tests/e2e/responsive-matrix-10.0.49.spec.ts",
  "tests/e2e/document-ocr-edge-cases-10.0.33.spec.ts",
  "tests/e2e/documents.spec.ts",
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
  ".github/workflows/pre039-axioma-120-145.yml",
  "navigation-performance-10.0.30.spec.ts",
  "workflow revalida árbol funcional/navegación",
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

const officialSections = [
  [120, "CASOS EXTREMOS"],
  [121, "LIMPIEZA FINAL"],
  [122, "NO ACUMULAR CÓDIGO TEMPORAL"],
  [123, "ÁRBOL FUNCIONAL FINAL"],
  [124, "INICIO"],
  [125, "CUENTAS"],
  [126, "MOVIMIENTOS"],
  [127, "PRESUPUESTOS"],
  [128, "ANÁLISIS"],
  [129, "PREVISIÓN"],
  [130, "DOCUMENTOS"],
  [131, "CONFIGURACIÓN"],
  [132, "GANTT OFICIAL"],
  [133, "ESTADOS DEL GANTT"],
  [134, "CÁLCULO DE AVANCE"],
  [135, "HITOS"],
  [136, "REGISTRO DE CONTINUIDAD"],
  [137, "INCIDENCIAS LOCALES Y ESTRUCTURALES"],
  [138, "RIESGOS QUE DEBEN EVITARSE"],
  [139, "CRITERIOS GLOBALES DE ACEPTACIÓN"],
  [140, "PRUEBAS DE REGRESIÓN"],
  [141, "PROTOCOLO TRAS CADA BLOQUE DE TRABAJO"],
  [142, "COMPORTAMIENTO DURANTE LA EJECUCIÓN"],
  [143, "QUEDA EXPRESAMENTE PROHIBIDO"],
  [144, "REGLA FINAL ABSOLUTA"],
  [145, "PRIMERA ACCIÓN"],
];

for (const [section, title] of officialSections) {
  requiredText(
    "docs/audits/pre039-axioma-120-145-certification-20261002.md",
    `| ${section} | ${title} |`,
    `Axioma definitivo §${section} ${title}`,
  );
}

requiredText(
  "docs/audits/pre039-axioma-120-145-certification-20261002.md",
  "Incidencia estructural: mapa de Axioma incorrecto",
  "trazabilidad de la corrección del mapa Axioma",
);

console.log(`PRE-039 · comprobaciones estáticas correctas: ${ok.length}`);

if (fail.length) {
  console.error("PRE-039 · NO LISTO para certificación runtime:");
  for (const error of fail) console.error(`- ${error}`);
  process.exit(1);
}

console.log("PRE-039 · puerta estática alineada con Axioma definitivo LISTA.");
console.log("Nota: esta puerta no sustituye las regresiones runtime (§140), el protocolo de cierre (§141), la ejecución real (§142) ni la verificación de producción exigida por las reglas globales del Axioma.");
