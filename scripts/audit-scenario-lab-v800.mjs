import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const sql=read("database/FINANCIAL_APP_8.0.0_SCENARIO_LAB.sql");
const api=read("app/api/scenarios/route.ts");
const page=read("app/escenarios/page.tsx");
const client=read("app/escenarios/scenario-lab.tsx");
const layout=read("app/escenarios/layout.tsx");
const css=read("app/escenarios/scenarios.css");
const navigation=read("components/app-navigation.tsx");
const model=read("lib/financial/forecast-scenario.ts");

for(const token of [
  "forecast_scenario_core",
  "forecast_liquidity_core(v_start,v_days)",
  "authorized_email()",
  "security definer",
  "security invoker",
  "scenario_too_many_definitions",
  "scenario_too_many_occurrences",
  "'usesCanonicalLiquidity',true",
  "'ephemeral',true",
  "'noPersistence',true",
  "'sourceDataReadOnly',true",
  "'maximumDays',180",
  "'maximumDefinitions',24",
  "'maximumOccurrences',120",
  "financial_app_forecast_scenario"
])must(sql.includes(token),`Contrato SQL 8.0 incompleto: ${token}`);

must(/revoke all on function public\.financial_app_forecast_scenario\(date,integer,jsonb\) from public,anon/i.test(sql),"El wrapper del simulador debe bloquear public/anon");
must(/grant execute on function public\.financial_app_forecast_scenario\(date,integer,jsonb\) to authenticated,service_role/i.test(sql),"Falta grant explícito del simulador autenticado");
must(!/\b(insert\s+into|update\s+financial_app\.|delete\s+from|truncate\s+)/i.test(sql),"El motor de escenarios no puede persistir ni mutar tablas financieras");
for(const kind of ["'once'","'monthly'","'installments'"])must(sql.includes(kind),`Falta modalidad de escenario ${kind}`);

for(const token of ["getAuthorizedClient()","apiUnauthorized()","financial_app_forecast_scenario","normalizeForecastScenario","scenario_too_many_definitions","invalid_scenario"])must(api.includes(token),`API de escenarios incompleta: ${token}`);
must(!/localStorage|sessionStorage|document\.cookie/.test(api+client),"El simulador no debe persistir estado en navegador");
must(api.includes("method:\"POST\"")===false,"La ruta API no debe contener llamadas fetch cliente");

for(const token of ["requireAuthorizedUser()","getForecastLiquidity(90)","ScenarioLab","Simulador de Decisiones"])must(page.includes(token),`Página de escenarios incompleta: ${token}`);
for(const token of ["/api/scenarios","Gasto puntual","Ingreso puntual","Compra a plazos","Gasto recurrente","Simular impacto","Previsión actual vs. escenario","No se ha guardado nada","ni constituye asesoramiento financiero"])must(client.includes(token),`Experiencia del simulador incompleta: ${token}`);
must(!client.includes("setResult(json as ForecastScenarioOverview);localStorage"),"No se puede persistir el resultado del escenario");

must(layout.includes('import "./scenarios.css";'),"Los estilos del simulador deben cargarse solo desde su layout");
must(navigation.includes('["Simulador","/escenarios"'),"El Simulador debe ser accesible desde Más");
must(!css.includes("!important"),"El CSS del simulador no puede usar !important");
for(const match of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g))must(Number(match[1])>=14,`El simulador contiene microtexto inferior a 14px (${match[1]}px)`);
for(const token of ["--background-primary","--surface-primary","--accent-primary","--negative","--positive"]){
  if(css.includes(token.replace("--","var(--")))continue;
}

for(const token of ["ScenarioKind","ScenarioLiquiditySummary","ForecastScenarioOverview","normalizeForecastScenario"])must(model.includes(token),`Modelo tipado de escenario incompleto: ${token}`);

if(failures.length){console.error("Financial App 8.0.0 scenario lab audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 8.0.0 scenario lab audit OK · hipótesis efímeras sobre liquidez canónica, sin persistencia ni segundo motor");
