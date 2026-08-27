import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const migration=read("database/FINANCIAL_APP_4.5.0_HOME_PERFORMANCE.sql");
const pulse=read("lib/financial/home-pulse.ts");
const home=read("app/page.tsx");
const sections=read("app/home-sections.tsx");
const streaming=read("lib/financial/home-streaming.ts");
const sync=read("components/sync-button.tsx");
const intent=read("components/intent-link.tsx");
const probe=read("lib/financial/release-probe.ts");
const e2e=read("scripts/authenticated-preview-e2e.mjs");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/ci.yml");

must(version.includes('APP_VERSION = "4.5.0"'),"APP_VERSION no es 4.5.0");
for(const token of ["transactions_latest_source_balance_idx","include (source_balance, account_id)","home_pulse_core","financial_app_home_pulse","'singleTransactionPass',true","'accountsExcludedFromCriticalPath',true","revoke all on function public.financial_app_home_pulse(date) from public,anon","grant execute on function public.financial_app_home_pulse(date) to authenticated,service_role"])
  must(migration.includes(token),`Falta garantía SQL 4.5: ${token}`);
must(!/insert\s+into\s+financial_app\.transactions/i.test(migration)&&!/update\s+financial_app\.transactions/i.test(migration)&&!/delete\s+from\s+financial_app\.transactions/i.test(migration),"4.5 no puede mutar movimientos");

must(pulse.includes('supabase.rpc("financial_app_home_pulse")')&&pulse.includes("accountsExcludedFromCriticalPath"),"Loader de pulso ligero incompleto");
must(home.includes("const pulsePromise=getHomePulse()")&&home.includes("const pulse=await pulsePromise"),"Inicio no usa el pulso crítico ligero");
must(!home.includes("getFinancialDashboard")&&!home.includes("dashboardPromise"),"Inicio no debe volver a bloquear por el dashboard completo");
must(home.includes("const accountsPromise=getAccountsOverview()")&&home.includes("<HomeAccountsSection data={accountsPromise}/>"),"Cuentas deben seguir transmitiéndose en paralelo");
must(sections.includes("pulse.needsReview")&&sections.includes("pulse.sync?.newCount"),"Decisiones de Inicio no usan el pulso 4.5");
must(streaming.includes("type HomeControlFinancials")&&!streaming.includes("FinancialDashboard"),"Control de Inicio sigue acoplado al dashboard completo");

must(!sync.includes("useEffect")&&!sync.includes("AUTO_SYNC_INTERVAL")&&!sync.includes("financial-app-last-auto-sync"),"La portada no puede resincronizar Drive automáticamente al montar");
must(sync.includes("data?.changed===true")&&sync.includes("startRefresh(()=>router.refresh())")&&sync.includes('"Sin cambios"'),"La actualización manual debe refrescar solo cuando cambian datos");
must(intent.includes("onTouchStart={event=>{warm();onTouchStart?.(event)}}"),"La navegación táctil debe precalentar el destino antes del tap completo");

must(probe.includes("homePulseReadable")&&probe.includes("accountsExcludedFromCriticalPath === true"),"Release probe no protege la ruta crítica 4.5");
must(e2e.includes('payload.version!=="4.5.0"')&&e2e.includes('"homePulseReadable"'),"E2E autenticado no valida 4.5");
must(pkg.scripts?.["audit:v450"]==="node scripts/audit-v450.mjs","Falta script audit:v450");
must(String(pkg.scripts?.prebuild||"").includes("audit-v450.mjs"),"prebuild no ejecuta 4.5");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v450.mjs"),"audit:current no ejecuta 4.5");
must(ci.includes("Performance and UX 4.5 audit")&&ci.includes("npm run audit:v450"),"CI no ejecuta el gate 4.5");

if(failures.length){console.error("Financial App 4.5 performance/UX audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Financial App 4.5 audit OK · Inicio ligero, saldos indexados, sync no disruptiva y navegación táctil precalentada");
