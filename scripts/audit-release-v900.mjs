import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_9.0.0_PENDING_INVOICE_COMMITMENTS.sql");
const release=read("database/FINANCIAL_APP_9.0.0_RELEASE.sql");
const notes=read("docs/releases/9.0.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const current=String(pkg.scripts?.["audit:current"]||"");

must(versionAtLeast(currentVersion,"9.0.0"),"APP_VERSION debe preservar como mínimo la baseline 9.0.0");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
must(current.includes("audit-pending-invoices-v900.mjs"),"audit:current no ejecuta el gate funcional 9.0.0");
must(current.includes("audit-release-v900.mjs"),"audit:current no ejecuta el cierre 9.0.0");
for(const token of [
  "forecast_calendar_document_commitments_core",
  "forecast_calendar_visible_core(p_start,p_months)",
  "document_match_candidates_rows_core(f.document_id,1)",
  "forecast_event_overrides",
  "forecast_calendar_document_commitments_core(v_start,v_months)",
  "'pendingInvoiceCommitments',true",
  "'sourceDataReadOnly',true"
])must(migration.includes(token),`Migración 9.0.0 incompleta: ${token}`);
for(const token of [
  "financial_app_9_0_0_requires_8_0_0_baseline",
  "financial_app_9_0_0_security_contract_missing",
  "financial_app_9_0_0_calendar_grants_invalid",
  "financial_app_9_0_0_document_forecast_contract_missing",
  "financial_app_9_0_0_canonical_liquidity_dependency_missing",
  "financial_app_9_0_0_source_data_mutation_detected",
  "'app_version',to_jsonb('9.0.0'::text)",
  "'target_version',to_jsonb('9.0.0'::text)",
  "financial_app_9_0_0_metadata_alignment_failed",
  "financial_app_9_0_0_manifest_alignment_failed"
])must(release.includes(token),`Release 9.0.0 incompleto: ${token}`);
for(const token of [
  "Financial App 9.0.0",
  "Facturas pendientes inteligentes",
  "45 días",
  "7 días",
  "matcher",
  "forecast_calendar_visible_core",
  "forecast_liquidity_core",
  "descartable",
  "solo lectura",
  "3.4.8"
])must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 9.0.0 incompletas: ${token}`);

if(failures.length){console.error("Financial App 9.0.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 9.0.0 release audit OK · baseline preservada por ${currentVersion} · Facturas pendientes inteligentes protegidas`);
