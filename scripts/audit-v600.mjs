import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const navigation=read("components/app-navigation.tsx");
const globals=read("app/globals.css");
const cashFlow=read("app/cash-flow/page.tsx");
const login=read("app/login/page.tsx");
const nextConfig=read("next.config.ts");
const productionSmoke=read(".github/workflows/production-smoke.yml");
const testMatrix=read("docs/TEST_MATRIX.md");
const releaseMigration=read("database/FINANCIAL_APP_6.0.0_RELEASE.sql");
const archiveMigration=read("database/FINANCIAL_APP_6.0.0_ARCHIVE_EXISTING_DOCUMENTS.sql");
const releaseNotes=read("docs/releases/6.0.0.md");
const vercel=JSON.parse(read("vercel.json"));

const versionMatch=version.match(/APP_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica y explícita");
if(versionMatch){
  const current=versionMatch.slice(1).map(Number);
  const minimum=[6,0,0];
  const ok=current[0]>minimum[0]||(current[0]===minimum[0]&&(current[1]>minimum[1]||(current[1]===minimum[1]&&current[2]>=minimum[2])));
  must(ok,"APP_VERSION debe conservar como mínimo las garantías de 6.0.0");
}
must(pkg.version==="3.4.8","La versión técnica del paquete debe conservar el baseline 3.4.8");
must(pkg.scripts?.["audit:v600"]==="node scripts/audit-v600.mjs","Falta script audit:v600");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v600.mjs"),"audit:current no protege el baseline 6.0.0");
must(pkg.scripts?.["preflight:supabase:release"]==="node scripts/preflight-supabase-contract.mjs --exact","Falta preflight Supabase exacto para el cierre de publicación");
must(!Object.prototype.hasOwnProperty.call(pkg.scripts||{},"e2e:preview"),"La familia 6.x no puede conservar un script E2E de Preview");
const deploymentEnabled=vercel?.git?.deploymentEnabled;
must(deploymentEnabled?.["**"]===false&&deploymentEnabled?.main===true,"Vercel debe bloquear todas las ramas y permitir despliegues Git únicamente desde main");

for(const retiredPath of [
  "app/auth/preview/route.ts",
  "scripts/authenticated-preview-e2e.mjs",
  "supabase/functions/financial-app-preview-session/index.ts",
]) must(!fs.existsSync(retiredPath),`Infraestructura de Preview retirada ha vuelto al runtime: ${retiredPath}`);
must(!login.toLowerCase().includes("preview"),"Login no puede ofrecer ni anunciar acceso temporal de Preview");
must(nextConfig.includes("X-Financial-App-Version")&&nextConfig.includes("APP_VERSION"),"La producción debe exponer la APP_VERSION como cabecera técnica para el smoke exacto");

for(const token of [
  "financial_app_6_0_0_requires_5_0_1_baseline",
  "drop function if exists public.financial_app_claim_preview_login(text,text)",
  "drop table if exists financial_app.preview_login_tokens",
  "financial_app_6_0_0_preview_auth_retirement_failed",
  "'app_version',to_jsonb('6.0.0'::text)",
  "'target_version',to_jsonb('6.0.0'::text)",
  "financial_app_release_manifest",
  "financial_app_6_0_0_manifest_alignment_failed",
]) must(releaseMigration.includes(token),`Migración de release 6.0.0 incompleta: ${token}`);
for(const table of ["transactions","documents","document_transaction_links","accounts"]){
  must(!new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+financial_app\\.${table}`,"i").test(releaseMigration),`La migración de versión no puede mutar ${table}`);
}

for(const token of [
  "archived_at is null",
  "created_at <= timestamptz",
  "archive_v6_migration",
  "system:financial-app-6.0.0",
  "document_history",
]) must(archiveMigration.includes(token),`Migración documental 6.0.0 incompleta: ${token}`);
must(!/(?:insert\s+into|update|delete\s+from)\s+financial_app\.transactions/i.test(archiveMigration),"La migración documental no puede mutar movimientos");
must(!/(?:insert\s+into|update|delete\s+from)\s+financial_app\.document_transaction_links/i.test(archiveMigration),"La migración documental no puede mutar asociaciones documento–movimiento");

const primaryBlock=navigation.split("const secondary")[0];
const secondaryBlock=navigation.split("const secondary")[1]?.split("function routeOf")[0]||"";
const expectedPrimary=[["Inicio","/"],["Cash Flow","/cash-flow"],["Movimientos","/movimientos"],["Análisis","/analisis"],["Archivo","/archivo"]];
for(const [label,href] of expectedPrimary)must(primaryBlock.includes(`["${label}","${href}"`),`Falta destino principal del baseline 6.0: ${label}`);
must((primaryBlock.match(/\["[^\"]+","\/[^"]*","[^"]+"\]/g)||[]).length===5,"La navegación principal debe conservar exactamente cinco destinos");
must(!primaryBlock.includes('["Previsión","/prevision"'),"Previsión no puede volver a ser destino principal");
must(secondaryBlock.includes('["Previsión","/prevision"'),"Previsión debe permanecer accesible desde Más");

for(const token of ["--gold-primary:","--gold-light:","--gold-dark:","--gold-hover:","--gold-active:"])
  must(globals.includes(token),`Identidad premium 6.x incompleta: ${token}`);
must(!globals.includes("--accent:"),"La familia 6.x no debe recuperar el alias visual --accent");
must(!globals.includes("--accent:#0b4f8a")&&!globals.includes("--accent:#4c9bff"),"La identidad azul no puede volver a dominar el producto");
must(cashFlow.includes("ForecastClient")&&cashFlow.includes("getForecastCalendar")&&cashFlow.includes("Promise.all"),"Cash Flow debe integrar la previsión canónica sin duplicarla");

for(const token of ["financialapp-home.vercel.app","EXPECTED_VERSION","/cash-flow","/movimientos","/analisis","/archivo","/configuracion"])
  must(productionSmoke.includes(token),`Smoke de producción del baseline 6.0 incompleto: ${token}`);
must(productionSmoke.toLowerCase().includes("x-financial-app-version"),"Smoke de producción no valida la cabecera de versión");
must(!productionSmoke.includes("finanzas-3-0.vercel.app")&&!productionSmoke.includes("/ajustes")&&!productionSmoke.includes("/auth/preview"),"Smoke de producción conserva alias/rutas o autenticación Preview obsoletos");
must(!/un único preview|preview del HEAD|promoción posterior a `main`/i.test(testMatrix),"La matriz de pruebas no puede exigir previews ni promoción posterior a main");

for(const token of ["Financial App 6.0.0","Cinco destinos principales","APP_VERSION","microtexto inferior a 14 px","Publicación sin previews"])
  must(releaseNotes.includes(token),`Release notes 6.0.0 incompletas: ${token}`);

if(failures.length){
  console.error("Financial App 6.0 baseline audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Financial App 6.0 baseline audit OK · navegación, identidad semántica, Preview retirada, smoke exacto, publicación solo desde main y migraciones seguras protegidas");
