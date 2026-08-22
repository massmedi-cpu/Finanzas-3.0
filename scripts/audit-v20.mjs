import { existsSync, readFileSync } from "node:fs";

const errors=[];
const need=[
  "lib/financial/plan.ts",
  "app/plan/page.tsx",
  "app/plan/layout.tsx",
  "app/plan.css",
  "database/FINANCIAL_APP_2.0.0_UNIFIED_PLAN.sql",
  "docs/AUDIT_FINANCIAL_APP_2.0.0.md",
];
for(const file of need)if(!existsSync(file))errors.push(`Falta ${file}`);

const version=readFileSync("lib/app-version.ts","utf8");
const plan=existsSync("lib/financial/plan.ts")?readFileSync("lib/financial/plan.ts","utf8"):"";
const page=existsSync("app/plan/page.tsx")?readFileSync("app/plan/page.tsx","utf8"):"";
const css=existsSync("app/plan.css")?readFileSync("app/plan.css","utf8"):"";
const sidebar=readFileSync("components/app-sidebar.tsx","utf8");
const sql=existsSync("database/FINANCIAL_APP_2.0.0_UNIFIED_PLAN.sql")?readFileSync("database/FINANCIAL_APP_2.0.0_UNIFIED_PLAN.sql","utf8"):"";
const pkg=JSON.parse(readFileSync("package.json","utf8"));
const lock=JSON.parse(readFileSync("package-lock.json","utf8"));

const match=version.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
const current=match?match.slice(1).map(Number):null;
const supports20=current&&(current[0]>=2);
if(!supports20)errors.push("La auditoría 2.0 exige Financial App >= 2.0.0");
if(pkg.version!==lock.version||pkg.version!==lock.packages?.[""]?.version)errors.push("package.json y package-lock no están alineados");
if(pkg.scripts?.["audit:v20"]!=="node scripts/audit-v20.mjs")errors.push("Falta script audit:v20");

if(!plan.includes('supabase.rpc("financial_app_plan_overview"'))errors.push("Plan no usa el RPC canónico 2.0");
const rpcCalls=(plan.match(/\.rpc\(/g)||[]).length;
if(rpcCalls!==1)errors.push(`Plan debe hacer una sola llamada RPC; encontradas ${rpcCalls}`);
for(const forbidden of ["getBudgetMonth","getForecastOverview","getGoalsOverview","getNetWorthOverview","getControlCenter"]){if(plan.includes(forbidden))errors.push(`Plan duplica lectura de dominio: ${forbidden}`)}
if(!page.includes("getFinancialPlan"))errors.push("La página Plan no consume la capa canónica");
if(!page.includes("Origen: {action.sourcePath}"))errors.push("Las prioridades no muestran trazabilidad de origen");
if(!page.includes("Cómo se construye este plan"))errors.push("Falta explicación de metodología");
if(!page.includes("readOnlyDecisionLayer")&&!page.includes("solo lectura"))errors.push("La UI no explica que el Plan es una capa de decisión no destructiva");
if(!css.includes(".plan-kpis")||!css.includes("@media(max-width:760px)"))errors.push("Plan no tiene layout responsive propio");
if(!sidebar.includes('["Plan", "/plan"]'))errors.push("Plan no está en navegación de escritorio");
if(!sidebar.includes('["Plan","/plan"]'))errors.push("Plan no está en navegación móvil principal");

for(const core of ["budget_overview_core","forecast_overview_core","goals_overview_core","net_worth_overview_core","control_center_core"]){if(!sql.includes(core))errors.push(`RPC 2.0 no reutiliza ${core}`)}
if(!sql.includes("financial_app.authorized_email()"))errors.push("RPC 2.0 no verifica allowlist autorizada");
if(!sql.includes("readOnlyDecisionLayer',true"))errors.push("RPC 2.0 no declara capa de decisión de solo lectura");
if(!sql.includes("noAutomaticFinancialMutations',true"))errors.push("RPC 2.0 no protege contra automatismos financieros");
if(!sql.includes("revoke all on function public.financial_app_plan_overview(date) from public, anon"))errors.push("Wrapper Plan no revoca acceso anónimo");
if(!sql.includes("grant execute on function public.financial_app_plan_overview(date) to authenticated, service_role"))errors.push("Wrapper Plan no limita EXECUTE a roles previstos");
if(!sql.includes("sourcePath"))errors.push("Prioridades 2.0 no incluyen trazabilidad sourcePath");
if(!sql.includes("forecastSuggestionsAffectProjection',false"))errors.push("Plan 2.0 dejó de proteger sugerencias no confirmadas");

if(errors.length){console.error("Financial App 2.0 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.0 audit OK · plan unificado, una RPC, trazabilidad, seguridad, responsive y protección no destructiva");
