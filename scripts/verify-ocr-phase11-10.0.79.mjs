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

requireText("src/application/document-ocr-review.ts", [
  'export type DocumentOcrReviewEvidence',
  'export type DocumentOcrReviewPriority = "high" | "standard" | "none"',
  '"issuer",',
  '"date",',
  '"totalCents",',
  'priorityReviewFields',
  'rawText: evidence.rawText',
]);

requireText("app/documents/ocr-page-review-workbench.tsx", [
  'Texto estructurado para revisión',
  'Reconstrucción geométrica',
  'OCR bruto',
  'ocr-trace-structured-',
  'ocr-trace-layout-',
  'ocr-trace-raw-',
  'No sustituye al OCR bruto',
]);

requireText("app/documents/ocr-review-workbench.module.css", [
  '.traceGridThree',
  'grid-template-columns:repeat(3,minmax(0,1fr))',
  '@media(max-width:980px)',
  'white-space:pre-wrap',
]);

// Los gates históricos deben seguir siendo acumulativos: una release nueva no puede
// fallar sólo porque una certificación anterior haya fijado su número exacto.
requireText("scripts/verify-transversals-phase10-10.0.78.mjs", [
  'function versionAtLeast(actual, minimum)',
  'versionAtLeast(pkg.version, "10.0.78")',
  'Fase 10 / 10.0.78+ certificada',
]);

for (const path of [
  "tests/e2e/document-ocr-review-quality-10.0.79.spec.ts",
  "tests/e2e/document-ocr-traceability-ui-10.0.79.spec.ts",
  "tests/e2e/document-ocr-review-workbench.spec.ts",
  "tests/e2e/document-ocr-structured-review.spec.ts",
  "tests/e2e/document-ocr-edge-cases-10.0.33.spec.ts",
  ".github/workflows/cr008-ocr-certification.yml",
  ".github/workflows/document-ocr-edge-cases.yml",
  ".github/workflows/ocr-review-workbench-10.0.46.yml",
]) requireFile(path);

const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
if (pkg.version !== "10.0.79") failures.push(`package.json debe declarar 10.0.79 y declara ${pkg.version}`);
if (lock.version !== "10.0.79" || lock.packages?.[""]?.version !== "10.0.79") failures.push("package-lock.json debe declarar 10.0.79 en raíz y paquete principal");
if (!String(pkg.scripts?.postbuild || "").includes("verify-ocr-phase11-10.0.79.mjs")) failures.push("postbuild no ejecuta la certificación OCR 10.0.79");

if (failures.length) {
  console.error("OCR Fase 11 / 10.0.79 NO certificada:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("OCR Fase 11 / 10.0.79 certificada: prioridad financiera, evidencia literal, trazabilidad en tres capas, responsive y regresión OCR acumulativa quedan bajo contrato.");
