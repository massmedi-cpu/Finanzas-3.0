import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.3.0_RELEASE.sql");
const triage=read("database/FINANCIAL_APP_6.3.0_DOCUMENT_TRIAGE.sql");
const notes=read("docs/releases/6.3.0.md");

const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return true};
must(atLeast(currentVersion,"6.3.0"),"APP_VERSION debe conservar como mínimo el baseline 6.3.0");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-document-triage-v630.mjs"),"audit:current no ejecuta el contrato de triage 6.3");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v630.mjs"),"audit:current no ejecuta el cierre 6.3");

for(const token of [
  "financial_app_6_3_0_requires_6_2_0_baseline",
  "'app_version',to_jsonb('6.3.0'::text)","'target_version',to_jsonb('6.3.0'::text)",
  "financial_app_6_3_0_metadata_alignment_failed","financial_app_6_3_0_manifest_alignment_failed"
])must(release.includes(token),`Release 6.3 incompleto: ${token}`);
for(const forbidden of ["update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions","update financial_app.documents","delete from financial_app.documents","insert into financial_app.transaction_documents","delete from financial_app.transaction_documents"])
  must(!release.toLowerCase().includes(forbidden),`Release metadata-only no puede mutar datos: ${forbidden}`);

for(const token of ["document_triage_core","financial_app_document_triage","document_matching_active_policy_core","noAutomaticActions","usesCanonicalMatchingPolicy"])
  must(triage.includes(token),`6.3 ha perdido triage canónico: ${token}`);
for(const token of ["Financial App 6.3.0","Atención documental","OCR fallido","metadatos incompletos","187.943,86 €","sin preview"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.3 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.3.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.3.0 release audit OK · baseline preservada por ${currentVersion} · triage universal, política canónica, acciones explícitas y cierre metadata-only protegidos`);
