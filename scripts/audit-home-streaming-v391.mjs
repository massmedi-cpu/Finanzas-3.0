import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const page=read("app/page.tsx");
for(const token of [
  'import { Suspense } from "react"',
  "const accountsPromise=getAccountsOverview()",
  "const budgetPromise=getBudgetMonth(month)",
  "const forecastPromise=getForecastOverview(30)",
  "const analysisPromise=getAnalysisOverview(year)",
  "const reconciliationPromise=getHomeReconciliationSummary()",
  "<HomeAccountsSection data={accountsPromise}/>",
  "<HomeFlowSection analysis={analysisPromise} budget={budgetPromise}/>",
  "<HomeForecastSection data={forecastPromise}/>",
]) must(page.includes(token),`Inicio ha perdido la garantía de streaming/paralelismo: ${token}`);

const legacyCritical=page.includes("const dashboardPromise=getFinancialDashboard()")&&page.includes("const dashboard=await dashboardPromise")&&page.includes("const controlPromise=Promise.all([dashboardPromise,budgetPromise])")&&page.includes("<HomeDecisionGrid dashboard={dashboard}");
const optimizedCritical=page.includes("const pulsePromise=getHomePulse()")&&page.includes("const pulse=await pulsePromise")&&page.includes("const controlPromise=Promise.all([pulsePromise,budgetPromise])")&&page.includes("<HomeDecisionGrid pulse={pulse}");
must(legacyCritical||optimizedCritical,"Inicio debe conservar un único núcleo crítico mientras el resto se transmite en paralelo");

must((page.match(/<Suspense\b/g)||[]).length>=4,"Inicio debe conservar al menos cuatro límites Suspense independientes");
must(!page.includes("getHomeOverview"),"Inicio no puede volver al RPC monolítico getHomeOverview");
must(!page.includes("await getAccountsOverview"),"Cuentas no puede volver a bloquear la primera respuesta");
must(!page.includes("await getForecastOverview"),"Previsión no puede volver a bloquear la primera respuesta");
must(!page.includes("await getAnalysisOverview"),"Análisis no puede volver a bloquear la primera respuesta");

const sections=read("app/home-sections.tsx");
for(const token of [
  "HomeAccountsFallback","HomePulseSecondaryFallback","HomeFlowFallback","HomeForecastFallback","HomeDecisionFallback",
  "Promise.all([analysis,budget])","Promise.all([analysis,budget,reconciliation,control])",
]) must(sections.includes(token),`Las secciones progresivas han perdido una garantía: ${token}`);
must((sections.includes("dashboard.needsReview")&&sections.includes("dashboard.sync?.newCount"))||(sections.includes("pulse.needsReview")&&sections.includes("pulse.sync?.newCount")),"Las decisiones de Inicio deben seguir mostrando revisión y última sincronización");

const loader=read("lib/financial/home-streaming.ts");
for(const token of ["financial_app_reconciliation_summary","financial_app_control_summary","p_cash_flow","p_budget"])
  must(loader.includes(token),`El loader ligero de Inicio ha perdido la garantía: ${token}`);

const migration=read("database/FINANCIAL_APP_3.9.1_HOME_STREAMING.sql");
for(const token of [
  "financial_app_reconciliation_summary",
  "financial_app_control_summary",
  "revoke all on function financial_app.reconciliation_summary_core() from public,anon",
  "grant execute on function financial_app.reconciliation_summary_core() to authenticated,service_role",
  "revoke all on function public.financial_app_reconciliation_summary() from public,anon",
  "grant execute on function public.financial_app_reconciliation_summary() to authenticated,service_role",
  "revoke all on function public.financial_app_control_summary(date,jsonb,jsonb) from public,anon",
  "grant execute on function public.financial_app_control_summary(date,jsonb,jsonb) to authenticated,service_role"
]) must(migration.includes(token),`La migración ligera de Inicio ha perdido la garantía: ${token}`);

if(failures.length){console.error("Financial App 3.9.1 home streaming audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 3.9.1 home streaming audit OK · núcleo crítico único, secundarios paralelos y resúmenes mínimos protegidos");
