import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_6.4.6_DRIVE_RECONCILIATION.sql");
const release=read("database/FINANCIAL_APP_6.4.6_RELEASE.sql");
const notes=read("docs/releases/6.4.6.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";

must(currentVersion==="6.4.6","APP_VERSION debe ser exactamente 6.4.6");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-drive-reconciliation-v646.mjs"),"audit:current no ejecuta el gate funcional 6.4.6");
must(current.includes("audit-release-v646.mjs"),"audit:current no ejecuta el cierre 6.4.6");
for(const token of [
  "drive_reconciliation_v646_checked",
  "set change_token=null",
  "reconciliationPending",
  "driveSync"
]) must(migration.includes(token),`Migración 6.4.6 incompleta: ${token}`);
for(const token of [
  "financial_app_6_4_6_requires_6_4_5_baseline",
  "financial_app_6_4_6_reconciliation_not_armed",
  "'app_version',to_jsonb('6.4.6'::text)",
  "'target_version',to_jsonb('6.4.6'::text)",
  "financial_app_6_4_6_metadata_alignment_failed",
  "financial_app_6_4_6_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.6 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.6",
  "archive_v6_migration",
  "Reconciliar Drive",
  "matching supervisado 6.x",
  "solo lectura",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.6 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.6 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.6 release audit OK · reconciliación Drive y transición 6.4.5→6.4.6 protegidas");
