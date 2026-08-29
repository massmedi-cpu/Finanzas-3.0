import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_7.0.0_LIQUIDITY_AGENDA.sql");
const release=read("database/FINANCIAL_APP_7.0.0_RELEASE.sql");
const notes=read("docs/releases/7.0.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const current=String(pkg.scripts?.["audit:current"]||"");

must(versionAtLeast(currentVersion,"7.0.0"),"APP_VERSION debe preservar como mínimo la baseline 7.0.0");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
must(current.includes("audit-forecast-liquidity-v700.mjs"),"audit:current no ejecuta el gate funcional 7.0.0");
must(current.includes("audit-release-v700.mjs"),"audit:current no ejecuta el cierre 7.0.0");
for(const token of [
  "forecast_liquidity_core",
  "financial_app_forecast_liquidity",
  "receivedEventsNotDoubleCounted",
  "sourceBalancesReadOnly"
]) must(migration.includes(token),`Migración 7.0.0 incompleta: ${token}`);
for(const token of [
  "financial_app_7_0_0_requires_6_5_0_baseline",
  "financial_app_7_0_0_liquidity_security_contract_missing",
  "financial_app_7_0_0_liquidity_grants_invalid",
  "'app_version',to_jsonb('7.0.0'::text)",
  "'target_version',to_jsonb('7.0.0'::text)",
  "financial_app_7_0_0_metadata_alignment_failed",
  "financial_app_7_0_0_manifest_alignment_failed"
]) must(release.includes(token),`Release 7.0.0 incompleto: ${token}`);
for(const token of [
  "Financial App 7.0.0",
  "Agenda Financiera Inteligente",
  "90 días",
  "saldo mínimo previsto",
  "forecast_calendar_visible_core",
  "no se vuelven a descontar",
  "solo lectura",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 7.0.0 incompletas: ${token}`);

if(failures.length){console.error("Financial App 7.0.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 7.0.0 release audit OK · baseline preservada por ${currentVersion} · Agenda Financiera Inteligente protegida`);
