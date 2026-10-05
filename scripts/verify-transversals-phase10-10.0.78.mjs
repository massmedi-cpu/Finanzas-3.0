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
  const parse = (value) => String(value).split(".").map((part) => Number(part));
  const left = parse(actual);
  const right = parse(minimum);
  if (left.length !== 3 || right.length !== 3 || left.some((part) => !Number.isSafeInteger(part) || part < 0) || right.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

// Feedback global: estados reales, accesibles y no silenciosos.
requireText("app/action-feedback.tsx", [
  '"pending" | "success" | "error"',
  'role={item.state === "error" ? "alert" : "status"}',
  'aria-live={item.state === "error" ? "assertive" : "polite"}',
  'aria-atomic="true"',
]);

// Estados globales: carga accesible y recuperación de error explícita.
requireText("app/loading.tsx", [
  'role="status"',
  'aria-live="polite"',
  'aria-label="Cargando sección"',
]);
requireText("app/error.tsx", [
  'role="alert"',
  'onClick={() => reset()}',
  'href="/"',
]);

// Alertas, navegación y rendimiento deben seguir gobernados por sus gates acumulativos.
for (const path of [
  ".github/workflows/global-alerts-10.0.47.yml",
  ".github/workflows/global-action-feedback-10.0.48.yml",
  ".github/workflows/navigation-performance.yml",
  "tests/e2e/responsive-matrix-10.0.49.spec.ts",
  "tests/e2e/mobile-quality-10.0.65.spec.ts",
  "tests/e2e/shared-app-shell-10.0.59.spec.ts",
  "tests/e2e/product-navigation-10.0.62.spec.ts",
  "tests/e2e/theme-system-10.0.63.spec.ts",
  "tests/e2e/navigation-performance-10.0.30.spec.ts",
  "scripts/verify-responsive-breakpoints.mjs",
  "scripts/verify-shared-app-shell.mjs",
  "scripts/verify-product-navigation.mjs",
  "scripts/verify-theme-system.mjs",
  "scripts/verify-mobile-quality-10.0.65.mjs",
  "scripts/verify-navigation-performance-10.0.30.mjs",
  "scripts/report-web-vitals.mjs",
]) requireFile(path);

const pkg = JSON.parse(read("package.json"));
if (!versionAtLeast(pkg.version, "10.0.78")) failures.push(`package.json debe declarar 10.0.78 o posterior y declara ${pkg.version}`);
if (!String(pkg.scripts?.postbuild || "").includes("verify-transversals-phase10-10.0.78.mjs")) {
  failures.push("postbuild no ejecuta la certificación de Fase 10");
}

if (failures.length) {
  console.error("Fase 10 / 10.0.78+ NO certificada:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Fase 10 / 10.0.78+ certificada: alertas, feedback, responsive, accesibilidad, navegación, estados globales, acabado y rendimiento quedan bajo gates acumulativos.");
