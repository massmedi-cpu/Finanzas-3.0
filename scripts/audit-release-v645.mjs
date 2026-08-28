import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_6.4.5_DRIVE_FILENAME_COMPAT.sql");
const release=read("database/FINANCIAL_APP_6.4.5_RELEASE.sql");
const notes=read("docs/releases/6.4.5.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const family=currentVersion.match(/^6\.4\.(\d+)$/);

must(Boolean(family)&&Number(family?.[1]||0)>=5,"APP_VERSION debe pertenecer a 6.4.x desde patch 5");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-drive-filename-v645.mjs"),"audit:current no ejecuta el gate funcional 6.4.5");
must(current.includes("audit-release-v645.mjs"),"audit:current no ejecuta el cierre 6.4.5");
for(const token of [
  "financial_app.drive_document_rows",
  "compact_filename_merchant",
  "20250826 Mercadona 23,49 €.pdf"
]) must(migration.includes(token),`Migración 6.4.5 incompleta: ${token}`);
for(const token of [
  "financial_app_6_4_5_requires_6_4_4_baseline",
  "financial_app_6_4_5_compact_drive_filename_regression",
  "'app_version',to_jsonb('6.4.5'::text)",
  "'target_version',to_jsonb('6.4.5'::text)",
  "financial_app_6_4_5_metadata_alignment_failed",
  "financial_app_6_4_5_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.5 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.5",
  "20250826 Mercadona 23,49 €.pdf",
  "matching 6.x",
  "solo lectura",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.5 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.5 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.5 release audit OK · baseline preservada por ${currentVersion} · compatibilidad Drive real y transición 6.4.4→6.4.5 protegidas`);
