import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.2.0_RELEASE.sql");
const policy=read("database/FINANCIAL_APP_6.2.0_SUPERVISED_MATCHING_POLICY.sql");
const activation=read("database/FINANCIAL_APP_6.2.0_POLICY_DRIVEN_MATCHING.sql");
const notes=read("docs/releases/6.2.0.md");

must(version.includes('APP_VERSION = "6.2.0"'),"APP_VERSION debe ser 6.2.0");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-supervised-matching-v620.mjs"),"audit:current no ejecuta el contrato supervisado 6.2");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v620.mjs"),"audit:current no ejecuta el cierre 6.2");

for(const token of [
  "financial_app_6_2_0_requires_6_1_0_baseline",
  "'app_version',to_jsonb('6.2.0'::text)","'target_version',to_jsonb('6.2.0'::text)",
  "financial_app_6_2_0_metadata_alignment_failed","financial_app_6_2_0_manifest_alignment_failed"
])must(release.includes(token),`Release 6.2 incompleto: ${token}`);
for(const forbidden of ["update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions","update financial_app.documents","delete from financial_app.documents","insert into financial_app.transaction_documents","delete from financial_app.transaction_documents"])
  must(!release.toLowerCase().includes(forbidden),`Release metadata-only no puede mutar datos: ${forbidden}`);

for(const token of ["document_matching_policies","requiresExplicitApproval","neverRelaxesAutomatically","document_matching_policy_rollback_core"])
  must(policy.includes(token),`6.2 ha perdido política supervisada: ${token}`);
for(const token of ["document_matching_active_policy_core()","score>=policy.min_score","score-second_score>=policy.min_margin"])
  must(activation.includes(token),`6.2 ha perdido motor gobernado: ${token}`);
for(const token of ["Financial App 6.2.0","política supervisada","20 decisiones","rollback","187.943,86 €","Sin previews"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.2 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.2.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.2.0 release audit OK · política supervisada, motor gobernado, aprobación explícita y cierre metadata-only protegidos");
