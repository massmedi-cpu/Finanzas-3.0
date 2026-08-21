import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const required = [
  "app/page.tsx",
  "app/cuentas/page.tsx",
  "app/movimientos/page.tsx",
  "app/cash-flow/page.tsx",
  "app/presupuesto/page.tsx",
  "app/prevision/page.tsx",
  "app/patrimonio/page.tsx",
  "app/analisis/page.tsx",
  "app/archivo/page.tsx",
  "app/configuracion/page.tsx",
  "app/api/movements/route.ts",
  "app/api/movements/[id]/route.ts",
  "app/api/movements/[id]/splits/route.ts",
  "lib/app-version.ts",
  "supabase/functions/financial-app-sync/index.ts",
  "database/FINANCIAL_APP_1.0.0_RC1_AUDIT_HARDENING.sql",
];

const forbiddenRoots = ["src"];
const errors = [];
for (const path of required) if (!existsSync(path)) errors.push(`Falta ${path}`);
for (const path of forbiddenRoots) if (existsSync(path)) errors.push(`Legado no permitido: ${path}`);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.name !== "financial-app") errors.push("package.json no pertenece a Financial App");
if (packageJson.version !== "1.0.0-rc.1") errors.push("Versión de package.json no centralizada en 1.0.0-rc.1");
const versionFile = readFileSync("lib/app-version.ts", "utf8");
if (!versionFile.includes('APP_VERSION = "1.0.0-rc.1"')) errors.push("lib/app-version.ts no coincide con el RC actual");

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
console.log(`Financial App structural audit OK · ${required.length} rutas críticas · ${activeFiles.length} archivos activos`);
