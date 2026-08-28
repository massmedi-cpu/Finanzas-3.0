import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.1_RELEASE.sql");
const migration=read("database/FINANCIAL_APP_6.4.1_MATCHING_POLICY_INDEX.sql");
const notes=read("docs/releases/6.4.1.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const patch=Number(currentVersion.match(/^6\.4\.(\d+)$/)?.[1]??-1);

must(patch>=1,"APP_VERSION debe preservar la familia 6.4.x desde la baseline 6.4.1");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-hardening-v641.mjs"),"audit:current no ejecuta hardening 6.4.1");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v641.mjs"),"audit:current no ejecuta el cierre 6.4.1");
for(const token of ["financial_app_6_4_1_requires_6_4_0_baseline","'app_version',to_jsonb('6.4.1'::text)","'target_version',to_jsonb('6.4.1'::text)","financial_app_6_4_1_matching_policy_index_required","financial_app_6_4_1_metadata_alignment_failed","financial_app_6_4_1_manifest_alignment_failed"])
  must(release.includes(token),`Release 6.4.1 incompleto: ${token}`);
for(const token of ["document_matching_policies_supersedes_policy_id_idx","financial_app.document_matching_policies(supersedes_policy_id)"])
  must(migration.includes(token),`6.4.1 ha perdido el hardening de índice: ${token}`);
for(const token of ["Financial App 6.4.1","hardening medido","supersedes_policy_id","3.4.8","no modifica movimientos","smoke"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.1 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.1 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.1 release audit OK · familia 6.4.x desde patch 1, índice medido y contratos canónicos protegidos");
