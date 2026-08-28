import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.1.0_RELEASE.sql");
const notes=read("docs/releases/6.1.0.md");
const matching=read("database/FINANCIAL_APP_6.1.0_EXPLAINABLE_DOCUMENT_MATCHING.sql");
const observability=read("database/FINANCIAL_APP_6.1.0_MATCHING_OBSERVABILITY.sql");
const history=read("database/FINANCIAL_APP_6.1.0_MATCHING_QUALITY_HISTORY.sql");
const calibration=read("database/FINANCIAL_APP_6.1.0_MATCHING_CALIBRATION.sql");

const versionMatch=version.match(/APP_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica");
if(versionMatch){
  const current=Number(versionMatch[1])*1_000_000+Number(versionMatch[2])*1_000+Number(versionMatch[3]);
  must(current>=6_001_000,"APP_VERSION debe conservar como mínimo la baseline 6.1.0");
}
must(pkg.version==="3.4.8","La versión técnica del paquete sigue siendo 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v610.mjs"),"audit:current no ejecuta el cierre 6.1.0");

for(const token of [
  "financial_app_6_1_0_requires_6_0_1_baseline",
  "'app_version',to_jsonb('6.1.0'::text)",
  "'target_version',to_jsonb('6.1.0'::text)",
  "financial_app_6_1_0_metadata_alignment_failed",
  "financial_app_6_1_0_manifest_alignment_failed",
]) must(release.includes(token),`Release 6.1.0 incompleto: ${token}`);
for(const forbidden of [
  "update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions",
  "update financial_app.documents","delete from financial_app.documents","insert into financial_app.documents",
  "update financial_app.accounts","delete from financial_app.accounts","insert into financial_app.accounts",
  "insert into financial_app.transaction_documents","delete from financial_app.transaction_documents",
]) must(!release.toLowerCase().includes(forbidden),`Release 6.1.0 no puede mutar datos: ${forbidden}`);

for(const [file,label,tokens] of [
  [matching,"matching",["document_match_candidates_rows_core","score_margin","auto_eligible"]],
  [observability,"observabilidad",["document_matching_observability_core","readOnlyObservability"]],
  [history,"histórico",["document_matching_quality_snapshots","storedNoFinancialValues","document_matching_dashboard_core"]],
  [calibration,"calibración",["document_matching_calibration_events","thresholdsAreObservedNotAutoAdjusted","noEntityIdsStored"]],
]) for(const token of tokens)must(file.includes(token),`6.1.0 ha perdido ${label}: ${token}`);

for(const token of [
  "Financial App 6.1.0","matching documental explicable","histórico agregado diario","calibración por decisiones reales",
  "no se modifican automáticamente","3.150 movimientos","187.943,86 €","sin preview intermedia",
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.1.0 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.1.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.1.0 release audit OK · baseline protegida y forward-compatible con releases 6.1+");
