import{existsSync,readFileSync}from"node:fs";
const errors=[];
const need=["components/app-chrome.tsx","app/chrome.css","app/manifest.ts","lib/auth/authorized-client.ts","app/api/backup/route.ts","database/FINANCIAL_APP_1.7.0_ARCHITECTURE_FOUNDATION.sql"];
for(const f of need)if(!existsSync(f))errors.push(`Falta ${f}`);
const version=readFileSync("lib/app-version.ts","utf8").match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"";
const major=Number.parseInt(version.split(".")[0]||"0",10)||0;
if(major>=5){
  if(!existsSync("lib/financial/home-pulse.ts"))errors.push("Falta lib/financial/home-pulse.ts en la arquitectura 5.0+");
  if(existsSync("lib/financial/home.ts"))errors.push("5.0+ no puede conservar el loader home.ts sustituido");
}else if(!existsSync("lib/financial/home.ts"))errors.push("Falta lib/financial/home.ts en la arquitectura histórica pre-5.0");

const movements=readFileSync("app/api/movements/route.ts","utf8");
const getPart=movements.split("export async function POST")[0];
if(getPart.includes("financial_app_mark_new_seen"))errors.push("GET /api/movements sigue teniendo efectos secundarios");
if(!movements.includes('body?.kind!=="seen"'))errors.push("Falta acknowledgement explícito de nuevos movimientos");

const home=readFileSync("app/page.tsx","utf8");
const criticalRead=home.includes("getHomePulse")||home.includes("getFinancialDashboard");
const progressiveHome=criticalRead&&["getHomeControlSummary","getHomeReconciliationSummary","Suspense"].every(contract=>home.includes(contract));
const unifiedHome=home.includes("getHomeOverview");
if(!unifiedHome&&!progressiveHome)errors.push("Inicio no usa una arquitectura de lectura financiera canónica");
if(!progressiveHome&&/getAccountsOverview|getBudgetMonth|getForecastOverview|getAnalysisOverview|getReconciliationOverview/.test(home))errors.push("Inicio conserva lecturas financieras paralelas antiguas fuera de la arquitectura progresiva");
if(major>=5&&home.includes("getFinancialDashboard"))errors.push("5.0+ no puede reintroducir getFinancialDashboard en Inicio");

const layout=readFileSync("app/layout.tsx","utf8");
if(!layout.includes("AppChrome"))errors.push("Falta shell persistente");
if(layout.includes("./movements.css")||layout.includes("./budget.css")||layout.includes("./rules.css"))errors.push("CSS de módulos sigue cargándose desde raíz");
const settings=readFileSync("app/configuracion/settings-client.tsx","utf8");
if(!settings.includes("/api/backup"))errors.push("Configuración no expone backup privado");
if(errors.length){console.error("Financial App 1.7 audit FAILED");errors.forEach(e=>console.error(`- ${e}`));process.exit(1)}
console.log("Financial App 1.7 audit OK · carga, navegación, lecturas puras, PWA y backup")
