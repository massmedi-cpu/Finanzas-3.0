import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_8.0.0_SCENARIO_LAB.sql");
const release=read("database/FINANCIAL_APP_8.0.0_RELEASE.sql");
const notes=read("docs/releases/8.0.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const current=String(pkg.scripts?.["audit:current"]||"");

must(versionAtLeast(currentVersion,"8.0.0"),"APP_VERSION debe preservar como mínimo la baseline 8.0.0");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
must(current.includes("audit-scenario-lab-v800.mjs"),"audit:current no ejecuta el gate funcional 8.0.0");
must(current.includes("audit-release-v800.mjs"),"audit:current no ejecuta el cierre 8.0.0");
for(const token of [
  "forecast_scenario_core",
  "forecast_liquidity_core(v_start,v_days)",
  "financial_app_forecast_scenario",
  "'ephemeral',true",
  "'noPersistence',true",
  "'sourceDataReadOnly',true"
]) must(migration.includes(token),`Migración 8.0.0 incompleta: ${token}`);
for(const token of [
  "financial_app_8_0_0_requires_7_0_0_baseline",
  "financial_app_8_0_0_scenario_security_contract_missing",
  "financial_app_8_0_0_scenario_grants_invalid",
  "financial_app_8_0_0_canonical_liquidity_dependency_missing",
  "'app_version',to_jsonb('8.0.0'::text)",
  "'target_version',to_jsonb('8.0.0'::text)",
  "financial_app_8_0_0_metadata_alignment_failed",
  "financial_app_8_0_0_manifest_alignment_failed"
]) must(release.includes(token),`Release 8.0.0 incompleto: ${token}`);
for(const token of [
  "Financial App 8.0.0",
  "Simulador de Decisiones",
  "90 días",
  "gasto puntual",
  "ingreso puntual",
  "compra a plazos",
  "gasto recurrente",
  "forecast_liquidity_core",
  "efímeros",
  "solo lectura",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 8.0.0 incompletas: ${token}`);

if(failures.length){console.error("Financial App 8.0.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 8.0.0 release audit OK · baseline preservada por ${currentVersion} · Simulador de Decisiones protegido`);
