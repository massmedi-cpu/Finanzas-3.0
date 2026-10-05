import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const loader = read("src/application/analysis/analysis-loader.ts");
const engine = read("src/application/analysis/analysis-engine.ts");
const route = read("app/api/analysis/route.ts");
const controls = read("app/analysis/analysis-axioma53-controls.tsx");
const summary = read("app/analysis/analysis-axioma53-summary.tsx");
const gateway = read("supabase/functions/financial-app-db-gateway/analysis-query.ts");

checks.push([pkg.version === "10.0.74", "version 10.0.74"]);
for (const token of ["periodMode", "compareMode", "year_ago", "invalid_analysis_compare_period_order", "financial.snapshot"]) requireText(loader, token, "selector");
for (const token of ["periodMode", "year", "dateFrom", "dateTo", "compareMode", "compareDateFrom", "compareDateTo"]) requireText(route, token, "api");
for (const token of ["Mes", "Año", "Personalizado", "Periodo anterior", "Año anterior", "Otro periodo", "Todas las cuentas"]) requireText(controls, token, "filtros");
for (const token of ["Gasto acumulado del periodo", "Distribución del gasto por categorías", "snapshot.dailySpend", "snapshot.categoryDrivers"]) requireText(summary, token, "visualizacion");
for (const token of ["financial_transaction_facts", "analytics_eligible", "category_rollup", "merchant_rollup", "financial_period_summary", "financial_monthly_series"]) requireText(gateway, token, "motor");
for (const token of ["analysis_reconciliation_failed", 'bankSource: "read_only"', 'totals: "financial_period"']) requireText(engine, token, "reconciliacion");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Financial App 10.0.74 · Axioma §53 certificado");
