import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.0_RELEASE.sql");
const operations=read("database/FINANCIAL_APP_6.4.0_DOCUMENT_OPERATIONS.sql");
const notes=read("docs/releases/6.4.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";

must(["6.4.0","6.4.1","6.4.2"].includes(currentVersion),"APP_VERSION debe preservar la baseline 6.4.0 o su hardening 6.4.x");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-document-operations-v640.mjs"),"audit:current no ejecuta el contrato operativo 6.4");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v640.mjs"),"audit:current no ejecuta el cierre 6.4");
for(const token of ["financial_app_6_4_0_requires_6_3_2_baseline","'app_version',to_jsonb('6.4.0'::text)","'target_version',to_jsonb('6.4.0'::text)","financial_app_6_4_0_metadata_alignment_failed","financial_app_6_4_0_manifest_alignment_failed"])
  must(release.includes(token),`Release 6.4 incompleto: ${token}`);
for(const token of ["document_operations_core","document_operations_batch_core","document_triage_core","archive_link_calibrated_core","safe_match_no_longer_valid"])
  must(operations.includes(token),`6.4 ha perdido operación canónica: ${token}`);
for(const token of ["Financial App 6.4.0","Centro de operaciones documentales","revalidar","50 operaciones","deshacerse","3.4.8"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.0 release audit OK · baseline preservada por 6.4.x, operaciones supervisadas, lote revalidado y reversibilidad protegidas");
