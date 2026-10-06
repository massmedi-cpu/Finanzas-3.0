import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

checks.push([pkg.version === "10.0.90", "versión canónica 10.0.90"]);
checks.push([
  String(pkg.scripts?.postbuild ?? "").includes("verify-transversal-certification-10.0.90.mjs"),
  "gate transversal incluido en postbuild",
]);

const sw = read("public/sw.js");
const auth = read("tests/e2e/production-auth.spec.ts");
const authRefresh = read("tests/e2e/auth-refresh-request-propagation.spec.ts");
const csp = read("tests/e2e/content-security-policy.spec.ts");
const security = read("tests/e2e/security-headers.spec.ts");
const pwa = read("tests/e2e/pwa-installability.spec.ts");
const pwaAndroid = read("tests/e2e/pwa-android-install.spec.ts");
const reflow = read("tests/e2e/reflow-accessibility-10.0.69.spec.ts");
const transactionsA11y = read("tests/e2e/transactions-accessibility.spec.ts");
const budgetsA11y = read("tests/e2e/budgets-accessibility.spec.ts");
const forecastA11y = read("tests/e2e/forecast-accessibility.spec.ts");
const forecastWrites = read("tests/e2e/forecast-write-integrity.spec.ts");
const backupV2 = read("tests/e2e/backup-restore-v2.spec.ts");
const restore = read("scripts/phase13-restore-rehearsal-v2.sh");
const backupWorkflow = read(".github/workflows/backup-v2-restore-rehearsal.yml");
const transactionManagement = read("supabase/functions/financial-app-db-gateway/transaction-management.ts");
const forecastLogic = read("supabase/functions/financial-app-db-gateway/forecast-logic.ts");
const documentLogic = read("supabase/functions/financial-app-db-gateway/document-logic.ts");

for (const token of [
  'self.addEventListener("fetch"',
  "fetch(request)",
]) requireText(sw, token, "PWA red");
checks.push([!sw.includes("caches.open"), "PWA no persiste respuestas privadas en Cache Storage"]);

for (const token of [
  "cross_site_mutation_rejected",
  "financial_app_is_authorized",
  "safeNextPath",
]) requireText(auth, token, "seguridad sesión");
for (const token of [
  "x-middleware-request-cookie",
  "content-security-policy",
]) requireText(authRefresh, token, "refresh sesión");
for (const token of [
  "default-src 'self'",
  "'strict-dynamic'",
  "frame-ancestors 'none'",
]) requireText(csp, token, "CSP");
for (const token of [
  "x-content-type-options",
  "x-frame-options",
  "permissions-policy",
]) requireText(security, token, "cabeceras seguridad");

for (const token of [
  "manifest.webmanifest",
  "service worker",
  "No es un acceso directo normal",
]) requireText(pwa, token, "PWA instalación");
requireText(pwaAndroid, "beforeinstallprompt", "PWA Android");

for (const token of [
  "equivalencia reflow 200%",
  "equivalencia reflow 400%",
  "overflow horizontal",
]) requireText(reflow, token, "reflow");
requireText(transactionsA11y, "44 px", "accesibilidad movimientos");
requireText(budgetsA11y, "Presupuestos", "accesibilidad presupuestos");
requireText(forecastA11y, "Previsión", "accesibilidad previsión");

for (const token of [
  "idempotency",
  "forecast_write_conflict",
]) requireText(forecastWrites, token, "integridad escrituras previsión");

for (const token of [
  "deletionMustBeReapprovedAfterRestore",
  "storage_archive_required",
  "workspaceTenancy",
]) requireText(backupV2, token, "backup v2");
for (const token of [
  "bank_source_policy",
  "deletion_policy_rows",
  "validate-financial-backup-v2.mjs",
]) requireText(restore, token, "restore v2");
for (const token of [
  "postgres:17",
  "phase13-restore-rehearsal-v2.sh",
]) requireText(backupWorkflow, token, "workflow restore");

for (const [source, token, label] of [
  [transactionManagement, "__ROLLBACK_TRANSACTION_MANAGEMENT_TEST__", "persistencia movimientos"],
  [transactionManagement, "__ROLLBACK_TRANSACTION_SPLIT_TEST__", "persistencia reparto"],
  [forecastLogic, "__ROLLBACK_FORECAST_TEST__", "persistencia previsión"],
  [documentLogic, "__ROLLBACK_DOCUMENT_TEST__", "persistencia documentos"],
]) requireText(source, token, label);

checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(
    read("app/transactions/transactions-client.tsx") +
    read("app/forecast/forecast-client.tsx") +
    read("app/documents/documents-client.tsx")
  ),
  "clientes no actualizan fuente bancaria",
]);

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Certificación transversal 10.0.90 · persistencia, restore, PWA, seguridad y accesibilidad");
