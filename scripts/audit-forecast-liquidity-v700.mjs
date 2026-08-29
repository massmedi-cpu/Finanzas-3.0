import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_7.0.0_LIQUIDITY_AGENDA.sql");
const model=read("lib/financial/forecast-liquidity.ts");
const dashboard=read("components/forecast-liquidity-dashboard.tsx");
const forecastPage=read("app/prevision/page.tsx");
const cashFlowPage=read("app/cash-flow/page.tsx");
const forecastClient=read("app/prevision/forecast-client.tsx");
const forecastLayout=read("app/prevision/layout.tsx");
const cashFlowLayout=read("app/cash-flow/layout.tsx");
const css=read("app/forecast-liquidity.css");

for(const token of [
  "create or replace function financial_app.forecast_liquidity_core",
  "financial_app.forecast_calendar_visible_core(v_start,v_months)",
  "a.account_role='operating'",
  "a.cash_flow_enabled=true",
  "coalesce(e.item->>'status','expected')<>'received'",
  "greatest((e.item->>'estimatedDate')::date,v_start)",
  "projected_balance",
  "minimumProjectedBalance",
  "minimumBalanceDate",
  "daysBelowZero",
  "pendingExpenses",
  "confidenceLevel",
  "projectedDayBalance",
  "usesCanonicalForecast",
  "receivedEventsNotDoubleCounted",
  "overdueAppliedAtStart",
  "sourceBalancesReadOnly",
  "security definer",
  "set search_path = ''",
  "security invoker",
  "revoke all on function public.financial_app_forecast_liquidity(date,integer) from public,anon",
  "grant execute on function public.financial_app_forecast_liquidity(date,integer) to authenticated,service_role"
]) must(migration.toLowerCase().includes(token.toLowerCase()),`Migración de liquidez 7.0 incompleta: ${token}`);

for(const forbidden of [
  "update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions",
  "update financial_app.accounts","delete from financial_app.accounts","insert into financial_app.accounts",
  "update financial_app.forecasts","delete from financial_app.forecasts","insert into financial_app.forecasts"
]) must(!migration.toLowerCase().includes(forbidden),`La agenda de liquidez no puede mutar datos de origen: ${forbidden}`);

for(const token of ["financial_app_forecast_liquidity","madridToday()","ForecastLiquidityOverview","maximumDays"])
  must(model.includes(token),`Modelo de liquidez incompleto: ${token}`);
for(const token of ["Saldo operativo hoy","Saldo mínimo previsto","Saldo al final del horizonte","Compromisos pendientes","Trayectoria de liquidez","Confianza del horizonte","Próximos compromisos","Ver proyección diaria accesible"])
  must(dashboard.includes(token),`Dashboard de liquidez incompleto: ${token}`);
must(dashboard.includes("formatEuro")&&dashboard.includes("Intl.DateTimeFormat"),"Dashboard debe conservar formato monetario y fechas es-ES");
must(!dashboard.includes("dangerouslySetInnerHTML"),"Dashboard de liquidez no debe introducir HTML inseguro");

must(forecastPage.includes("getForecastLiquidity(90)")&&forecastPage.includes("Agenda Financiera Inteligente")&&forecastPage.includes("<ForecastLiquidityDashboard"),"Previsión debe convertirse en Agenda Financiera Inteligente de 90 días");
must(cashFlowPage.includes("getForecastLiquidity(90)")&&cashFlowPage.includes("<ForecastLiquidityDashboard data={liquidity} compact"),"Cash Flow debe integrar la misma agenda de liquidez en modo compacto");
must(forecastClient.includes('from "next/navigation"')&&forecastClient.includes("router.refresh()"),"Cambios de previsión deben refrescar también la proyección server-side");
must(forecastLayout.includes('import "../forecast-liquidity.css";')&&cashFlowLayout.includes('import "../forecast-liquidity.css";'),"Previsión y Cash Flow deben cargar la hoja de liquidez solo en sus rutas consumidoras");
for(const token of [".liquidity-kpis",".liquidity-chart",".liquidity-commitment","@media(max-width:680px)"])
  must(css.includes(token),`CSS de liquidez incompleto: ${token}`);
must(!css.includes("!important"),"Agenda de liquidez no puede depender de !important");

if(failures.length){console.error("Financial App 7.0 liquidity agenda audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 7.0 liquidity agenda audit OK · saldo futuro diario, mínimo, compromisos, confianza y forecast canónico protegidos");
