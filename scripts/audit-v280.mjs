import { existsSync, readFileSync } from "node:fs";

const errors = [];
const required = [
  "database/FINANCIAL_APP_2.8.0_SYSTEM_INTEGRITY.sql",
  "lib/financial/integrity-shared.ts",
  "lib/financial/integrity.ts",
  "app/api/control/integrity/route.ts",
  "app/control/integrity-panel.tsx",
  "app/control/integrity.css",
  "app/control/layout.tsx",
  "scripts/integrity-v280-tests.ts",
];
for (const file of required) if (!existsSync(file)) errors.push(`Falta ${file}`);
const read = file => existsSync(file) ? readFileSync(file, "utf8") : "";
const sql = read(required[0]);
const lower = sql.toLowerCase();

for (const token of [
  "system_audits", "enable row level security", "revoke all", "system_integrity_snapshot_core",
  "system_integrity_overview_core", "run_system_audit_core", "financial_app_system_integrity",
  "financial_app_run_system_audit", "sourcechecksum", "fingerprint", "read_only",
]) if (!lower.includes(token.toLowerCase())) errors.push(`SQL 2.8 sin garantía: ${token}`);

const snapshotStart = lower.indexOf("create or replace function financial_app.system_integrity_snapshot_core");
const overviewStart = lower.indexOf("create or replace function financial_app.system_integrity_overview_core");
const runStart = lower.indexOf("create or replace function financial_app.run_system_audit_core");
if (snapshotStart < 0 || overviewStart < 0 || runStart < 0) errors.push("No se pueden delimitar las funciones 2.8");
else {
  const readCore = lower.slice(snapshotStart, runStart);
  for (const forbidden of ["insert into", "update financial_app.", "delete from financial_app."]) {
    if (readCore.includes(forbidden)) errors.push(`La lectura 2.8 contiene escritura prohibida: ${forbidden}`);
  }
  const runCore = lower.slice(runStart);
  if (!runCore.includes("insert into financial_app.system_audits")) errors.push("La auditoría profunda no persiste su snapshot");
}

const shared = read(required[1]);
if (shared.includes("@/lib/supabase/server") || shared.includes("next/headers")) errors.push("El modelo compartido 2.8 depende de APIs de servidor");
const server = read(required[2]);
if (!server.includes("@/lib/supabase/server")) errors.push("El loader 2.8 no mantiene Supabase en servidor");

const route = read(required[3]);
for (const token of ["getAuthorizedClient", "export async function GET", "export async function POST", "financial_app_system_integrity", "financial_app_run_system_audit"]) {
  if (!route.includes(token)) errors.push(`API 2.8 incompleta: ${token}`);
}
const getBlock = route.match(/export async function GET\([\s\S]*?(?=export async function POST)/)?.[0] || "";
if (/financial_app_run_system_audit/.test(getBlock)) errors.push("GET 2.8 no puede ejecutar auditorías persistentes");

const panel = read(required[4]);
for (const token of ["Ejecutar auditoría profunda", 'method: "POST"', "shortFingerprint", "summarizeIntegrityChecks"]) {
  if (!panel.includes(token)) errors.push(`Panel 2.8 sin garantía: ${token}`);
}
const control = read("app/control/page.tsx");
for (const token of ["getSystemIntegrityOverview", "Promise.all", "IntegrityPanel"]) if (!control.includes(token)) errors.push(`Control no integra 2.8: ${token}`);
const routeLayout = read("app/control/layout.tsx");
if (!routeLayout.includes("./integrity.css")) errors.push("CSS de integridad no cargado en el layout de Control");
const rootLayout = read("app/layout.tsx");
if (rootLayout.includes("control/integrity.css")) errors.push("CSS de integridad no debe cargarse globalmente");
const vercel = read("vercel.json");
if (!vercel.includes('"develop/v2.8.0-integrity-rebuild": false')) errors.push("Vercel no está bloqueado para la rama 2.8 reconstruida");
const ci = read(".github/workflows/ci.yml");
for (const token of ["audit:v280", "test:integrity"]) if (!ci.includes(token)) errors.push(`CI no ejecuta ${token}`);

if (errors.length) {
  console.error("Financial App 2.8 audit FAILED");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log("Financial App 2.8 audit OK · lecturas puras, auditoría explícita, CSS acotado y huellas persistentes");
