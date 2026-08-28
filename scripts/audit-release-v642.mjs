import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.2_RELEASE.sql");
const migration=read("database/FINANCIAL_APP_6.4.2_MATCHING_DASHBOARD_SECURITY.sql");
const notes=read("docs/releases/6.4.2.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const patch=Number(currentVersion.match(/^6\.4\.(\d+)$/)?.[1]??-1);

must(patch>=2,"APP_VERSION debe preservar la familia 6.4.x desde la baseline 6.4.2");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-security-v642.mjs"),"audit:current no ejecuta seguridad 6.4.2");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v642.mjs"),"audit:current no ejecuta el cierre 6.4.2");
for(const token of ["financial_app_6_4_2_requires_6_4_1_baseline","financial_app_6_4_2_security_contract_required","'app_version',to_jsonb('6.4.2'::text)","'target_version',to_jsonb('6.4.2'::text)","financial_app_6_4_2_metadata_alignment_failed","financial_app_6_4_2_manifest_alignment_failed"])
  must(release.includes(token),`Release 6.4.2 incompleto: ${token}`);
for(const token of ["security invoker","document_matching_dashboard_core","authenticated,service_role"])
  must(migration.toLowerCase().includes(token.toLowerCase()),`Hardening 6.4.2 ausente: ${token}`);
for(const token of ["Financial App 6.4.2","SECURITY INVOKER","authorized_email()","Google OAuth","3.4.8"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.2 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.2 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.2 release audit OK · familia 6.4.x desde patch 2 y frontera RPC hardened protegida");
