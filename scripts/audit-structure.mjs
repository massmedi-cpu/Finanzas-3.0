import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const required = [
  "app/page.tsx",
  "app/control/page.tsx",
  "app/control/control-client.tsx",
  "app/cuentas/page.tsx",
  "app/movimientos/page.tsx",
  "app/cash-flow/page.tsx",
  "app/presupuesto/page.tsx",
  "app/prevision/page.tsx",
  "app/patrimonio/page.tsx",
  "app/analisis/page.tsx",
  "app/archivo/page.tsx",
  "app/configuracion/page.tsx",
  "app/api/control/route.ts",
  "app/api/movements/route.ts",
  "app/api/movements/[id]/route.ts",
  "app/api/movements/[id]/splits/route.ts",
  "lib/app-version.ts",
  "lib/financial/control.ts",
  "supabase/functions/financial-app-sync/index.ts",
  "database/FINANCIAL_APP_1.0.0_RC1_AUDIT_HARDENING.sql",
  "database/FINANCIAL_APP_1.0.0_RC2_VERSION_ALIGNMENT.sql",
  "database/FINANCIAL_APP_1.0.0_STABLE_VERSION.sql",
  "database/FINANCIAL_APP_1.2.0_VERSION.sql",
  "database/FINANCIAL_APP_1.4.0_CONTROL_CENTER.sql",
  "database/FINANCIAL_APP_1.4.0_DUPLICATE_FILTER.sql",
];

const forbiddenRoots = ["src"];
const errors = [];
for (const path of required) if (!existsSync(path)) errors.push(`Falta ${path}`);
for (const path of forbiddenRoots) if (existsSync(path)) errors.push(`Legado no permitido: ${path}`);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.name !== "financial-app") errors.push("package.json no pertenece a Financial App");

if (!existsSync("package-lock.json")) {
  errors.push("Falta package-lock.json reproducible");
} else {
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const root = packageLock.packages?.[""];
  if (packageLock.name !== packageJson.name || packageLock.version !== packageJson.version || root?.version !== packageJson.version) {
    errors.push("package.json y package-lock.json no comparten nombre/versión canónicos");
  }
}

const versionFile = readFileSync("lib/app-version.ts", "utf8");
const appVersion = versionFile.match(/APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
if (appVersion !== packageJson.version) errors.push(`lib/app-version.ts (${appVersion ?? "sin versión"}) no coincide con package.json (${packageJson.version})`);

const controlApi = readFileSync("app/api/control/route.ts", "utf8");
if (!controlApi.includes("financial_app_control_center")) errors.push("Centro de Control no usa la RPC canónica");
if (!controlApi.includes("financial_app_close_month")) errors.push("Falta cierre mensual en la API de Control");
const movementsLayer = readFileSync("lib/financial/movements.ts", "utf8");
if (!movementsLayer.includes("financial_app_movements_advanced_v14")) errors.push("Movimientos no usa el motor v1.4 con filtro de duplicados");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const activeFiles = [...walk("app"), ...walk("components"), ...walk("lib")].filter(p => /\.(ts|tsx)$/.test(p));
for (const file of activeFiles) {
  const text = readFileSync(file, "utf8");
  if (/finanzas-v3-|Finanzas 3\.0|V3\.0\./i.test(text)) errors.push(`Referencia heredada en ${file}`);
}

if (errors.length) {
  console.error("Financial App structural audit FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Financial App structural audit OK · ${required.length} rutas críticas · ${activeFiles.length} archivos activos · ${packageJson.version}`);
