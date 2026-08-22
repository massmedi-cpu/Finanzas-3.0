import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const required = [
  "app/page.tsx",
  "app/control/page.tsx",
  "app/control/control-client.tsx",
  "app/cuentas/page.tsx",
  "app/movimientos/page.tsx",
  "app/reglas/page.tsx",
  "app/reglas/rules-client.tsx",
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
  "app/api/rules/route.ts",
  "lib/app-version.ts",
  "lib/financial/control.ts",
  "lib/financial/rules.ts",
  "supabase/functions/financial-app-sync/index.ts",
  "database/FINANCIAL_APP_1.0.0_RC1_AUDIT_HARDENING.sql",
  "database/FINANCIAL_APP_1.0.0_RC2_VERSION_ALIGNMENT.sql",
  "database/FINANCIAL_APP_1.0.0_STABLE_VERSION.sql",
  "database/FINANCIAL_APP_1.2.0_VERSION.sql",
  "database/FINANCIAL_APP_1.4.0_CONTROL_CENTER.sql",
  "database/FINANCIAL_APP_1.4.0_DUPLICATE_FILTER.sql",
  "database/FINANCIAL_APP_1.4.0_SECURITY_HARDENING.sql",
  "database/FINANCIAL_APP_1.4.0_VERSION.sql",
  "database/FINANCIAL_APP_1.6.0_RULES_ENGINE.sql",
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
const securitySql = readFileSync("database/FINANCIAL_APP_1.4.0_SECURITY_HARDENING.sql", "utf8");
if (!securitySql.includes("security invoker")) errors.push("Los wrappers públicos 1.4 no están protegidos como SECURITY INVOKER");
if (!securitySql.includes("movements_advanced_v14_enriched_core")) errors.push("Falta el permiso interno del enriquecedor v1.4");

const rulesApi=readFileSync("app/api/rules/route.ts","utf8");
for(const rpc of ["financial_app_rules_overview","financial_app_preview_rule","financial_app_upsert_rule","financial_app_apply_rule","financial_app_deactivate_rule","financial_app_revert_rule"]){if(!rulesApi.includes(rpc))errors.push(`Reglas no usa la RPC canónica ${rpc}`);}
const rulesSql=readFileSync("database/FINANCIAL_APP_1.6.0_RULES_ENGINE.sql","utf8").toLowerCase();
if(!rulesSql.includes("security invoker"))errors.push("Los wrappers públicos del motor de reglas no son SECURITY INVOKER");
if(!rulesSql.includes("transactions_apply_rules_after_insert"))errors.push("Falta el trigger automático para movimientos nuevos");
if(!rulesSql.includes("rule_field_has_later_user_edit"))errors.push("Falta la protección de ediciones manuales al deshacer reglas");
if(!rulesSql.includes("revoke all on function financial_app.apply_rule_to_transaction_internal"))errors.push("Los helpers SECURITY DEFINER de reglas no están cerrados al cliente");
const sidebar=readFileSync("components/app-sidebar.tsx","utf8");
if(!sidebar.includes('["Reglas", "/reglas"]'))errors.push("Reglas no está integrada en la navegación principal");

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
  if (/1\.0\.0-rc\.1|1\.2\.0/.test(text)) errors.push(`Versión activa obsoleta escrita a mano en ${file}`);
}

if (errors.length) {
  console.error("Financial App structural audit FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Financial App structural audit OK · ${required.length} rutas críticas · ${activeFiles.length} archivos activos · ${packageJson.version}`);
