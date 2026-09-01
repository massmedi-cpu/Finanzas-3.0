import fs from "node:fs";
import path from "node:path";

const read=p=>fs.readFileSync(p,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};
const appVersion=read("lib/app-version.ts");
const globals=read("app/globals.css");
const navigation=read("components/app-navigation.tsx");
const client=read("app/prevision/forecast-client.tsx");
const forecastPage=read("app/prevision/page.tsx");
const liquidityDashboard=read("components/forecast-liquidity-dashboard.tsx");
const css=read("app/forecast.css");
const controls=read("app/controls.css");
const cashFlowPage=read("app/cash-flow/page.tsx");
const api=read("app/api/forecast/route.ts");
const lib=read("lib/financial/forecast-calendar.ts");
const migration=read("database/FINANCIAL_APP_3.7.0_FORECAST_DISMISSALS.sql");
const hotfix=read("database/FINANCIAL_APP_3.7.1_FORECAST_READ_SECURITY.sql");
const actuals=read("database/FINANCIAL_APP_3.7.2_FORECAST_ACTUALS.sql");
const ledger410=fs.existsSync("database/FINANCIAL_APP_4.1.0_FORECAST_LEDGER.sql")?read("database/FINANCIAL_APP_4.1.0_FORECAST_LEDGER.sql"):"";

const version=appVersion.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return true};
must(atLeast(version,"3.7.2"),"La versión visible debe conservar como mínimo los contratos funcionales de 3.7.2");

// v6 replaces the old blue product identity. Blue remains semantic info only.
for(const token of ["--accent-primary:","--accent-light:","--accent-dark:","--accent-muted:","--accent-hover:","--accent-active:","--focus:"])
  must(globals.includes(token),`Falta identidad premium canónica: ${token}`);
must(!globals.includes("--accent:"),"La identidad premium 6.x no debe depender del alias --accent");
for(const legacyBlue of ["--accent:#0b4f8a","--accent-soft:#e7f1fb","--focus:#0b4f8a","--accent:#4c9bff","--focus:#4c9bff"])
  must(!globals.includes(legacyBlue),`La identidad azul 3.7 no puede volver a dominar: ${legacyBlue}`);
for(const legacy of ["#6f4e37","#d2a174","#8d6441","#ede2d7","#34281f"])
  must(!globals.toLowerCase().includes(legacy),`globals.css conserva marrón retirado: ${legacy}`);

const primaryBlock=navigation.split("const secondary")[0];
const secondaryBlock=navigation.split("const secondary")[1]?.split("function routeOf")[0]||"";
for(const [label,href] of [["Inicio","/"],["Cash Flow","/cash-flow"],["Movimientos","/movimientos"],["Análisis","/analisis"],["Previsión","/prevision"],["Archivo","/archivo"]])
  must(primaryBlock.includes(`["${label}","${href}"`),`Navegación primaria incompleta: ${label}`);
must(!secondaryBlock.includes('["Previsión","/prevision"'),"Previsión no debe duplicarse dentro de Más si ya está en navegación principal");
must(cashFlowPage.includes("ForecastClient")&&cashFlowPage.includes("getForecastCalendar")&&cashFlowPage.includes("Promise.all"),"Cash Flow debe integrar el calendario/previsión canónico sin duplicar su lógica");
must(forecastPage.includes("showCommitments={false}"),"La página de Previsión debe evitar repetir la lista de compromisos antes del calendario");
must(liquidityDashboard.includes("showCommitments=true")&&liquidityDashboard.includes("showCommitments&&<article className=\"liquidity-commitments\""),"El panel de liquidez debe permitir ocultar compromisos redundantes sin perderlos en otros contextos");

for(const token of ["forecast-cashflow-summary","Cash Flow estimado","Ingresos estimados","Gastos estimados","effectiveAmount(event)","danger-button","removeEvent(event)"])
  must(client.includes(token),`Previsión ha perdido contrato funcional: ${token}`);
for(const token of [
  'className={`inline-alert ${feedback.tone}`}',
  'className={`status-badge forecast-status ${statusTone(event)}`}',
  'recurringManual?"text-button":"danger-button"',
  'className="danger-button" onClick={()=>removeSeries(event)}',
  'className="ghost" onClick={()=>restoreEvent(event)',
  'className="icon-button" aria-label="Mes anterior"',
  'className="icon-button" aria-label="Mes siguiente"',
]) must(client.includes(token),`Previsión ha perdido integración con controles/estados canónicos: ${token}`);
for(const legacyControl of ["forecast-delete-button","ghost-action","icon-action","link-button"])
  must(!client.includes(legacyControl),`Previsión no debe recuperar el control legacy ${legacyControl}`);
must(client.includes("Ya no cuenta en los cálculos del mes")||client.includes("Ya no cuenta en el cash flow estimado"),"Previsión debe informar que un descarte deja de contar en los cálculos");
must(client.includes('event.status==="received"&&event.actual?event.actual.amount:event.estimatedAmount'),"Los confirmados deben usar importe real y los demás estimado");

for(const token of [
  "removeSeries(event)",
  'event.source!=="manual"',
  'event.frequency==="once"',
  "!event.forecastId",
  "new URLSearchParams({id:event.forecastId})",
  "Eliminar serie",
  "Quitar este",
  "Serie eliminada"
]) must(client.includes(token),`Previsión ha perdido eliminación segura de series manuales: ${token}`);
must(client.includes('event.source==="manual"&&event.frequency!=="once"&&Boolean(event.forecastId)'),"La acción Eliminar serie solo debe mostrarse en forecasts manuales recurrentes con forecastId");

const legacyClientProjection=[
  "data.actualMonths.find","event.status!==\"received\"","actualMonth.cashFlow+pendingFlow.cashFlow","actualMonth.income+pendingFlow.income","actualMonth.expenses+pendingFlow.expenses"
].every(token=>client.includes(token));
const serverProjection=
  client.includes("data.projectionMonths.find")&&
  client.includes("projection.projectedCashFlow")&&
  client.includes("projection.projectedIncome")&&
  client.includes("projection.projectedExpenses")&&
  lib.includes("ForecastProjectionMonth")&&lib.includes("projectionMonths")&&
  ledger410.includes("status<>'received'")&&
  ledger410.includes("coalesce(a.cash_flow,0)+coalesce(p.cash_flow,0)")&&
  ledger410.includes("coalesce(a.income,0)+coalesce(p.income,0)")&&
  ledger410.includes("coalesce(a.expenses,0)+coalesce(p.expenses,0)")&&
  ledger410.includes("confirmedEventsNotDoubleCounted")&&ledger410.includes("dismissedEventsExcludedFromMetrics");
must(legacyClientProjection||serverProjection,"La proyección mensual debe sumar real + pendiente, excluir confirmados del pendiente y excluir descartados");
must(client.includes("real +")&&client.includes("todavía previsto"),"La UI debe explicar la composición real + pendiente del Cash Flow estimado");

must(api.includes("financial_app_dismiss_forecast_event")&&api.includes("eventId")&&api.includes("p_estimated_date"),"DELETE de Previsión debe descartar una ocurrencia persistente");
must(api.includes("financial_app_cancel_forecast")&&api.includes('searchParams.get("id")'),"DELETE de Previsión debe conservar la cancelación completa de series manuales");
for(const token of ["actualMonths","ForecastActualMonth","normalizedCategoryFallbackMatching","actualExpensesIncludedInProjection","confirmedEventsNotDoubleCounted","forecastId"])
  must(lib.includes(token),`Contrato tipado de previsión incompleto: ${token}`);
for(const token of ["forecast_event_overrides","dismiss_forecast_event","financial_app_dismiss_forecast_event","dismissibleOccurrences","dismissedEventsExcludedFromMetrics","o.event_id=x.item->>'id'"])
  must(migration.includes(token),`Migración 3.7 incompleta: ${token}`);
must(migration.includes("revoke all on table financial_app.forecast_event_overrides from public,anon,authenticated")&&migration.includes("grant execute on function public.financial_app_dismiss_forecast_event"),"La persistencia de descartes debe mantener frontera de autorización");
for(const token of ["forecast_calendar_visible_core","security definer","financial_app.authorized_email()","forecast_event_overrides","select financial_app.forecast_calendar_visible_core(p_start,p_months)"])
  must(hotfix.toLowerCase().includes(token.toLowerCase()),`Hotfix 3.7.1 de lectura incompleto: ${token}`);
must(hotfix.includes("revoke all on function financial_app.forecast_calendar_visible_core(date,integer) from public,anon")&&hotfix.includes("grant execute on function financial_app.forecast_calendar_visible_core(date,integer) to authenticated,service_role"),"El hotfix debe mantener la frontera de autorización de la lectura");
for(const token of ["actualMonths","normalizedCategoryFallbackMatching","actualExpensesIncludedInProjection","confirmedEventsNotDoubleCounted","regexp_replace","event_ranked","transaction_ranked","a.cash_flow_enabled=true","t.cash_flow_override is distinct from false"])
  must(actuals.includes(token),`Migración 3.7.2 incompleta: ${token}`);
must(actuals.includes("greatest(2::numeric,abs((v.item->>'estimatedAmount')::numeric)*.05)"),"El fallback de confirmación debe mantener una tolerancia de importe estrecha");
must(actuals.includes("already.item->'actual'->>'transactionId'=t.id::text"),"El fallback no debe reutilizar movimientos ya confirmados");
must(actuals.includes("row_number() over(partition by b.transaction_id"),"Un movimiento real no debe confirmar dos previsiones");
if(ledger410){
  must(ledger410.includes("event_rank=1 and transaction_rank=1"),"4.1 debe reforzar la conciliación previsión↔real 1↔1");
  must(ledger410.includes("actualExpensesIncludedInProjection")&&ledger410.includes("serverSideMonthlyProjection"),"4.1 debe mantener gastos reales dentro de la proyección canónica");
}
must(css.includes(".forecast-cashflow-summary{"),"Faltan estilos del resumen de Previsión");
for(const token of [".danger-action,.danger-button{",".text-button{",".ghost{",".icon-button{",".status-badge{",".inline-alert{"])
  must(controls.includes(token),`El sistema canónico no contiene el control requerido por Previsión: ${token}`);
must(!css.includes(".forecast-delete-button{")&&!css.includes(".link-button{")&&!css.includes(".forecast-feedback{"),"Previsión no debe recuperar estilos locales de controles/feedback compartidos");

const roots=["app","components"];
const banned=["#6f4e37","#d2a174","#8d6441","#ede2d7","#34281f"];
for(const root of roots){
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(css|tsx|ts)$/.test(entry.name)){const text=read(full).toLowerCase();for(const color of banned)if(text.includes(color))failures.push(`${full}: conserva color marrón retirado ${color}`);}}};
  walk(root);
}

if(failures.length){console.error("Forecast/Cash Flow v6 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Forecast/Cash Flow v6 audit OK · previsión canónica, controles compartidos, descartes reversibles, series manuales gestionables y proyección protegida");
