import { existsSync, readFileSync } from "node:fs";

const errors=[];
const required=[
  "database/FINANCIAL_APP_2.0.0_READ_ONLY_FORECAST_HOTFIX.sql",
  "database/FINANCIAL_APP_2.0.1_READ_PATH_HARDENING.sql",
  "database/FINANCIAL_APP_2.0.1_VERSION.sql",
  "docs/AUDIT_FINANCIAL_APP_2.0.1.md",
  "docs/RELEASE_V2.0.1.md",
  "components/google-login-button.tsx",
];
for(const file of required)if(!existsSync(file))errors.push(`Falta ${file}`);

const read=(file)=>existsSync(file)?readFileSync(file,"utf8"):"";
const hotfix=read("database/FINANCIAL_APP_2.0.0_READ_ONLY_FORECAST_HOTFIX.sql");
const hardening=read("database/FINANCIAL_APP_2.0.1_READ_PATH_HARDENING.sql");
const versionSql=read("database/FINANCIAL_APP_2.0.1_VERSION.sql");
const appVersion=read("lib/app-version.ts");
const google=read("components/google-login-button.tsx");
const forecastRoute=read("app/api/forecast/route.ts");
const ci=read(".github/workflows/ci.yml");
const vercel=read("vercel.json");
const readme=read("README.md");
const pkg=JSON.parse(read("package.json")||"{}");

const semver=(value)=>String(value||"").split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y}return true};
if(!atLeast(pkg.version,"2.0.1"))errors.push("La versión actual es anterior a 2.0.1");
if(!appVersion.includes(`APP_VERSION = "${pkg.version}"`))errors.push("APP_VERSION no coincide con package.json");
if(!versionSql.includes("'app_version', to_jsonb('2.0.1'::text)"))errors.push("La migración histórica no fija app_version 2.0.1");
if(!versionSql.includes("'target_version', to_jsonb('2.0.1'::text)"))errors.push("La migración histórica no fija target_version 2.0.1");

if(!hotfix.includes("forecast_refresh_call_not_found"))errors.push("El hotfix de Previsión no verifica la retirada del refresh en lectura");
if(!hotfix.includes("alter function financial_app.forecast_overview_core(date, integer) stable"))errors.push("Previsión no queda protegida como STABLE");
if(!hotfix.includes("alter function public.financial_app_forecast_overview(date, integer) stable"))errors.push("El RPC público de Previsión no queda protegido como STABLE");

for(const fn of [
  "authorized_email",
  "movements_rpc",
  "movements_advanced_core",
  "movements_advanced_enriched_core",
  "movements_advanced_v14_core",
  "movements_advanced_v14_enriched_core",
  "transaction_detail_rpc",
  "transaction_detail_enriched_core",
  "plan_overview_core",
  "financial_app_movements",
  "financial_app_movements_advanced",
  "financial_app_movements_advanced_v14",
  "financial_app_transaction_detail",
  "financial_app_rules_overview",
  "financial_app_preview_rule",
  "financial_app_plan_overview",
])if(!hardening.includes(`'${fn}'`))errors.push(`El hardening 2.0.1 no cubre ${fn}`);
if(!hardening.includes("alter function %I.%I(%s) stable"))errors.push("El hardening no fuerza STABLE en las lecturas verificadas");
if(!hardening.includes("refusing to mark write-capable function"))errors.push("El hardening no se niega a reclasificar funciones con escritura directa");

if(!google.includes('window.location.assign("/login?error=oauth")'))errors.push("Google OAuth vuelve a ocultar errores inmediatos");
const forecastGet=forecastRoute.split("export async function POST")[0];
if(/financial_app_(upsert|cancel)_forecast/.test(forecastGet))errors.push("GET /api/forecast contiene una mutación");
if(!forecastGet.includes('financial_app_forecast_overview'))errors.push("GET /api/forecast dejó de usar el overview canónico");

if(pkg.scripts?.["audit:v201"]!=="node scripts/audit-v201.mjs")errors.push("Falta script audit:v201 en package.json");
if(!ci.includes("npm run audit:v201"))errors.push("CI no ejecuta la auditoría 2.0.1");
if(!vercel.includes('"financial-app-rebuild": false'))errors.push("La rama de estabilización puede gastar previews de Vercel");
if(!readme.includes("financialapp-home.vercel.app"))errors.push("README no refleja el dominio público actual");
if(!readme.includes("## 2.0.1 — estabilización"))errors.push("README ya no documenta las garantías de la release 2.0.1");

if(errors.length){
  console.error("Financial App 2.0.1 stabilization audit FAILED");
  errors.forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Financial App 2.0.1 audit OK · garantías preservadas en ${pkg.version}, lecturas puras, RPC STABLE, OAuth visible y rama sin previews`);
