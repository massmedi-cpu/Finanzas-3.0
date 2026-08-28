import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_6.4.8_FORECAST_PRECISION.sql");
const release=read("database/FINANCIAL_APP_6.4.8_RELEASE.sql");
const notes=read("docs/releases/6.4.8.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";

must(versionAtLeast(currentVersion,"6.4.8"),"APP_VERSION debe preservar como mínimo la baseline 6.4.8");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-forecast-precision-v648.mjs"),"audit:current no ejecuta el gate funcional 6.4.8");
must(current.includes("audit-release-v648.mjs"),"audit:current no ejecuta el cierre 6.4.8");
for(const token of [
  "genericTaxNeedsRepeatedIdentity",
  "extract(year from prior.d)<>extract(year from h.d)",
  "financial_app.forecast_calendar_core(p_start,p_months)"
]) must(migration.includes(token),`Migración 6.4.8 incompleta: ${token}`);
for(const token of [
  "financial_app_6_4_8_requires_6_4_7_baseline",
  "financial_app_6_4_8_forecast_contract_missing",
  "financial_app_6_4_8_precision_rule_missing",
  "'app_version',to_jsonb('6.4.8'::text)",
  "'target_version',to_jsonb('6.4.8'::text)",
  "financial_app_6_4_8_metadata_alignment_failed",
  "financial_app_6_4_8_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.8 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.8",
  "Bizum",
  "16,01",
  "dos años distintos",
  "Línea Directa",
  "IRPF",
  "solo lectura",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.8 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.8 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.8 release audit OK · baseline preservada por ${currentVersion} · precisión anual de Previsión protegida`);
