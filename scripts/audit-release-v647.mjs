import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.7_RELEASE.sql");
const notes=read("docs/releases/6.4.7.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const family=currentVersion.match(/^6\.4\.(\d+)$/);

must(Boolean(family)&&Number(family?.[1]||0)>=7,"APP_VERSION debe pertenecer a 6.4.x desde patch 7");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-bulk-movement-parity-v647.mjs"),"audit:current no ejecuta el gate funcional 6.4.7");
must(current.includes("audit-release-v647.mjs"),"audit:current no ejecuta el cierre 6.4.7");
for(const token of [
  "financial_app_6_4_7_requires_6_4_6_baseline",
  "financial_app_6_4_7_bulk_contract_missing",
  "financial_app.bulk_update_transactions_rpc(uuid[],jsonb)",
  "financial_app.update_transaction_rpc(uuid,jsonb)",
  "'app_version',to_jsonb('6.4.7'::text)",
  "'target_version',to_jsonb('6.4.7'::text)",
  "financial_app_6_4_7_metadata_alignment_failed",
  "financial_app_6_4_7_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.7 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.7",
  "concepto normalizado",
  "comercio o contraparte",
  "descripción",
  "notas",
  "200 movimientos",
  "update_transaction_rpc",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.7 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.7 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.7 release audit OK · baseline preservada por ${currentVersion} · edición múltiple reversible y transición 6.4.6→6.4.7 protegidas`);
