import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const navigation=read("components/app-navigation.tsx");
const globals=read("app/globals.css");
const cashFlow=read("app/cash-flow/page.tsx");
const releaseMigration=read("database/FINANCIAL_APP_6.0.0_RELEASE.sql");
const archiveMigration=read("database/FINANCIAL_APP_6.0.0_ARCHIVE_EXISTING_DOCUMENTS.sql");
const releaseNotes=read("docs/releases/6.0.0.md");

must(/APP_VERSION\s*=\s*["']6\.0\.0["']/.test(version),"APP_VERSION debe ser exactamente 6.0.0");
must(pkg.version==="3.4.8","La versión técnica del paquete debe conservar el baseline 3.4.8");
must(pkg.scripts?.["audit:v600"]==="node scripts/audit-v600.mjs","Falta script audit:v600");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v600.mjs"),"audit:current no protege el gate 6.0.0");

for(const token of [
  "financial_app_6_0_0_requires_5_0_1_baseline",
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
for(const [label,href] of expectedPrimary)must(primaryBlock.includes(`["${label}","${href}"`),`Falta destino principal 6.0.0: ${label}`);
must((primaryBlock.match(/\["[^\"]+","\/[^"]*","[^"]+"\]/g)||[]).length===5,"La navegación principal debe conservar exactamente cinco destinos");
must(!primaryBlock.includes('["Previsión","/prevision"'),"Previsión no puede volver a ser destino principal");
must(secondaryBlock.includes('["Previsión","/prevision"'),"Previsión debe permanecer accesible desde Más");

for(const token of ["--gold-primary:","--gold-light:","--gold-dark:","--gold-hover:","--gold-active:","--accent:var(--gold-primary)"])
  must(globals.includes(token),`Identidad premium 6.0 incompleta: ${token}`);
must(!globals.includes("--accent:#0b4f8a")&&!globals.includes("--accent:#4c9bff"),"La identidad azul no puede volver a dominar el producto");
must(cashFlow.includes("ForecastClient")&&cashFlow.includes("getForecastCalendar")&&cashFlow.includes("Promise.all"),"Cash Flow debe integrar la previsión canónica sin duplicarla");

for(const token of ["Financial App 6.0.0","Cinco destinos principales","APP_VERSION","microtexto inferior a 14 px"])
  must(releaseNotes.includes(token),`Release notes 6.0.0 incompletas: ${token}`);

if(failures.length){
  console.error("Financial App 6.0.0 audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Financial App 6.0.0 audit OK · versión, navegación, identidad, previsión integrada y migraciones seguras protegidas");
