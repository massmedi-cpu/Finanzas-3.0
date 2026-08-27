import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const checks=[];
const must=(ok,message)=>{if(!ok)checks.push(message)};
const appVersion=read("lib/app-version.ts");
const sql=read("database/FINANCIAL_APP_4.4.0_ACTIONABLE_INTELLIGENCE.sql");
const lib=read("lib/financial/actionable-intelligence.ts");
const page=read("app/inteligencia/page.tsx");
const client=read("app/inteligencia/intelligence-client.tsx");
const api=read("app/api/intelligence/route.ts");
const nav=read("components/app-navigation.tsx");
const plan=read("components/plan-intelligence.tsx");
const probe=read("lib/financial/release-probe.ts");
const css=read("app/intelligence.css");

const currentVersion=appVersion.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return true};
must(atLeast(currentVersion,"4.4.0"),"APP_VERSION debe ser 4.4.0 o posterior");
must(sql.includes("actionable_intelligence_core")&&sql.includes("financial_app_actionable_intelligence"),"RPC 4.4 no definido de extremo a extremo");
must(sql.includes("anomaly_raw")&&sql.includes("recurring_raw")&&sql.includes("rising_raw")&&sql.includes("opportunity_raw"),"Faltan familias de señales 4.4");
must(sql.includes("h.n>=3")&&sql.includes("median_amount*1.75")&&sql.includes("r.avg_interval between 20 and 45")&&sql.includes("r.recent>=r.previous*1.25"),"Umbrales conservadores de evidencia incompletos");
must(sql.includes("savingsScenarioPercent',10")&&sql.includes("usesCompleteMonthsForTrends',true"),"Contrato de tendencias/escenario incompleto");
must(sql.includes("reusesControlAlertStates',true")&&sql.includes("financialValuesPersisted',false")&&sql.includes("sourceReadOnly',true"),"Garantías de solo lectura/estado canónico incompletas");
must(!/create\s+table/i.test(sql),"4.4 no debe crear otra tabla de telemetría o estados");
must(sql.includes("transactions_intelligence_date_idx"),"Falta índice temporal de inteligencia");
must(sql.includes("revoke all on function public.financial_app_actionable_intelligence")&&sql.includes("grant execute on function public.financial_app_actionable_intelligence(integer) to authenticated,service_role"),"Frontera RPC 4.4 no está restringida");
must(sql.includes("financial_app_matching_observability")&&sql.includes("app_meta")&&sql.includes("#>> '{}'"),"La identidad de release de observabilidad no usa la versión canónica");

must(lib.includes("movementUrl(movementState")&&lib.includes("financial_app_actionable_intelligence"),"Contrato TypeScript no enlaza señales con Movimientos/RPC");
must(page.includes("Señales concretas sobre tus gastos")&&page.includes("IntelligenceClient"),"Pantalla Inteligencia incompleta");
must(api.includes("getAuthorizedClient")&&api.includes("apiUnauthorized")&&api.includes("apiFailure"),"API de inteligencia no respeta frontera privada/sanitizada");
must(nav.includes('["Inteligencia","/inteligencia"]'),"Inteligencia no está en navegación");
must(plan.includes('href="/inteligencia"'),"Plan no enlaza con Inteligencia accionable");
must(client.includes('fetch("/api/control"')&&client.includes('kind:"alert"'),"Las acciones no reutilizan control_alert_states mediante Control");
must(client.includes("<Actions keyValue={item.key} state={item.state}/>"),"La tendencia debe permitir solo posponer, sin resolución permanente");
must(client.includes("formatEuro")&&client.includes("formatPercent")&&client.includes("formatSignedPercent"),"La UI no reutiliza formateadores es-ES canónicos");
must(!client.includes("toLocaleString"),"La UI 4.4 no debe introducir formateo numérico paralelo");
must(probe.includes("intelligenceReadable")&&probe.includes("intelligenceContracts")&&probe.includes("financialValuesPersisted === false"),"Release probe no protege 4.4");
must(css.includes(".intelligence-workspace")&&css.includes("@media(max-width:720px)"),"Estilos/responsive de Inteligencia incompletos");

if(checks.length){console.error("Financial App 4.4 actionable intelligence audit FAILED");for(const item of checks)console.error(`- ${item}`);process.exit(1)}
console.log("Financial App 4.4 audit OK · anomalías, recurrencias, tendencias y escenarios explicables · estado canónico, solo lectura y release gate protegidos");
