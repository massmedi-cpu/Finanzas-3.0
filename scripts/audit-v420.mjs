import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};
const versionSource=read("lib/app-version.ts");
const previewRoute=read("app/auth/preview/route.ts");
const releaseProbe=read("lib/financial/release-probe.ts");
const e2e=read("scripts/authenticated-preview-e2e.mjs");
const previewSql=read("database/FINANCIAL_APP_PREVIEW_LOGIN.sql");
const edge=read("supabase/functions/financial-app-preview-session/index.ts");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/ci.yml");
const productionSmoke=read(".github/workflows/production-smoke.yml");

const version=versionSource.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return true};
must(atLeast(version,"4.2.0"),"La versión visible debe ser 4.2.0 o posterior");

for(const token of ['process.env.VERCEL_ENV !== "preview"','token.length < 32 || token.length > 160','financial-app-preview-session','hasFinancialAppAccess','target === "/api/release-probe"','X-Financial-App-Preview-Probe','authenticated-read'])
  must(previewRoute.includes(token),`Preview E2E ha perdido contrato: ${token}`);
must(!previewRoute.includes("runSync")&&!previewRoute.includes('target === "/api/sync"'),"El probe de release no puede ejecutar sincronizaciones ni mutaciones");
must(previewRoute.includes('target.origin !== request.nextUrl.origin')&&previewRoute.includes('target.pathname.startsWith("/auth/")'),"El destino temporal debe seguir limitado al mismo origen y fuera de /auth");

const commonProbeTokens=["getMovements","getForecastCalendar","getArchiveOverview","movementsReadable","forecastReadable","archiveReadable","forecastContracts","privateSession: true"];
for(const token of commonProbeTokens)must(releaseProbe.includes(token),`Probe autenticado incompleto: ${token}`);
if(atLeast(version,"5.0.0")){
  for(const token of ["getAccountsOverview","getHomePulse","accountsReadable","homePulseReadable"])
    must(releaseProbe.includes(token),`Probe 5.0 no usa superficies canónicas: ${token}`);
  must(!releaseProbe.includes("getFinancialDashboard")&&!releaseProbe.includes("dashboardReadable"),"5.0 no puede conservar el dashboard sustituido dentro del probe");
}else{
  for(const token of ["getFinancialDashboard","dashboardReadable"])
    must(releaseProbe.includes(token),`Probe histórico incompleto: ${token}`);
}
for(const forbidden of ["totalAvailable","estimatedAmount","actualAmount","documentCount","fileName","ocrText","sourceOriginalConcept"])
  must(!releaseProbe.includes(forbidden),`El probe no debe serializar datos financieros/documentales: ${forbidden}`);
must(releaseProbe.includes("getMovements({ page: 1, pageSize: 1 })")&&releaseProbe.includes("getForecastCalendar(1)"),"El probe debe minimizar el volumen de lectura");
must(releaseProbe.includes("oneToOneActualMatching")&&releaseProbe.includes("serverSideMonthlyProjection")&&releaseProbe.includes("dismissedEventsExcludedFromMetrics"),"El probe debe verificar contratos críticos de Previsión 4.1");

for(const token of ["FINANCIAL_APP_PREVIEW_URL","FINANCIAL_APP_PREVIEW_TOKEN","FINANCIAL_APP_VERCEL_PROTECTION_BYPASS",'searchParams.set("next","/api/release-probe")','redirect:"manual"','payload.privateSession!==true','One-time token replay was not rejected','rejected.searchParams.get("error")!=="preview"'])
  must(e2e.includes(token),`Runner E2E incompleto: ${token}`);
must(!e2e.includes("console.log(token")&&!e2e.includes("console.error(token"),"El runner E2E no debe imprimir el token efímero");

for(const token of ["preview_login_tokens","token_hash","deployment_host","expires_at","used_at is null","lower(deployment_host)=lower(trim(p_host))"])
  must(previewSql.includes(token),`Persistencia one-time de Preview incompleta: ${token}`);
must(previewSql.includes("revoke all on financial_app.preview_login_tokens from public,anon,authenticated")&&previewSql.includes("grant execute on function public.financial_app_claim_preview_login(text,text) to service_role"),"Los tokens de Preview deben quedar fuera de Data API y solo reclamables por service_role");
for(const token of ["sha256(token)","financial_app_claim_preview_login","SERVICE_ROLE_KEY","auth.admin.generateLink","verifyOtp"])
  must(edge.includes(token),`Exchange de sesión Preview incompleto: ${token}`);

must(pkg.scripts?.["audit:v420"]==="node scripts/audit-v420.mjs","Falta script audit:v420");
must(String(pkg.scripts?.prebuild||"").includes("audit-v420.mjs"),"prebuild debe ejecutar el gate 4.2");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v420.mjs"),"audit:current debe ejecutar el gate 4.2");
must(ci.includes("Authenticated release E2E 4.2 audit")&&ci.includes("npm run audit:v420"),"CI debe ejecutar el gate 4.2");
must(productionSmoke.includes("/auth/preview?token=")&&productionSmoke.includes("Expected preview auth to stay disabled in production")&&productionSmoke.includes('"404"'),"Producción debe probar que /auth/preview permanece desactivado");

if(failures.length){console.error("Financial App 4.2 authenticated release E2E audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Financial App 4.2 audit OK · Preview autenticada one-time, probe privado solo lectura, replay rechazado y producción sin bypass protegidos");
