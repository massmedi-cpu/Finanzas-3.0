import fs from "node:fs";
import path from "node:path";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const migration=read("database/FINANCIAL_APP_5.0.0_ARCHITECTURE_CLOSURE.sql");
const probe=read("lib/financial/release-probe.ts");
const e2e=read("scripts/authenticated-preview-e2e.mjs");
const canonical=read("docs/CANONICAL_ARCHITECTURE.md");
const architecture=read("docs/ARCHITECTURE.md");
const readme=read("README.md");
const nextAudit=read("docs/README_AUDIT_NEXT.txt");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/ci.yml");

const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const left=semver(value),right=semver(minimum);for(let index=0;index<3;index+=1){if((left[index]||0)!==(right[index]||0))return(left[index]||0)>(right[index]||0)}return true};
must(atLeast(currentVersion,"5.0.0"),"APP_VERSION es anterior a la arquitectura base 5.0.0");
must(!fs.existsSync("lib/financial/home.ts"),"Permanece el loader monolítico home.ts sustituido");
must(!fs.existsSync("lib/financial/dashboard.ts"),"Permanece el loader dashboard.ts sustituido");

const runtimeRoots=["app","components","lib"];
const runtimeFiles=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(?:ts|tsx|js|mjs)$/.test(entry.name))runtimeFiles.push(full.replaceAll("\\","/"));}}
for(const root of runtimeRoots)walk(root);
for(const file of runtimeFiles){
  const source=read(file);
  for(const token of ["getFinancialDashboard","financial_app_dashboard","getHomeOverview","financial_app_home_overview"])
    must(!source.includes(token),`Runtime 5.0 conserva contrato sustituido ${token} en ${file}`);
}

for(const token of [
  "drop function if exists public.financial_app_home_overview() restrict",
  "drop function if exists public.financial_app_dashboard(date) restrict",
  "drop function if exists financial_app.home_overview_core() restrict",
  "drop function if exists financial_app.dashboard_rpc(date) restrict",
  "to_regprocedure('financial_app.dashboard_rpc(date)')",
  "'app_version',to_jsonb('5.0.0'::text)",
  "'target_version',to_jsonb('5.0.0'::text)",
]) must(migration.includes(token),`Migración 5.0 incompleta: ${token}`);
must(!/\bcascade\b/i.test(migration),"5.0 no puede usar CASCADE para retirar arquitectura");
must(!/insert\s+into\s+financial_app\.transactions/i.test(migration)&&!/update\s+financial_app\.transactions/i.test(migration)&&!/delete\s+from\s+financial_app\.transactions/i.test(migration),"5.0 no puede mutar movimientos");

for(const token of ["getAccountsOverview","getHomePulse","accountsReadable","homePulseReadable","getMovements","getForecastCalendar","getArchiveOverview","getMatchingObservability","getActionableIntelligence"])
  must(probe.includes(token),`Probe 5.0 ha perdido superficie canónica: ${token}`);
must(!probe.includes("getFinancialDashboard")&&!probe.includes("dashboardReadable"),"Probe 5.0 sigue acoplado al dashboard sustituido");
must(e2e.includes("expectedVersion")&&e2e.includes('"accountsReadable"')&&e2e.includes('"homePulseReadable"'),"E2E 5.0 no valida versión dinámica y superficies canónicas");
must(!e2e.includes('"dashboardReadable"'),"E2E 5.0 conserva el dashboard sustituido");

must(canonical.includes("5.0.0"),"CANONICAL_ARCHITECTURE no declara la arquitectura base 5.0.0");
must(architecture.includes("5.0.0"),"ARCHITECTURE no declara la arquitectura base 5.0.0");
const readmeDeclaresBaseline=readme.includes("5.0.0")||readme.includes(`Baseline ${currentVersion}`)||readme.includes(`Financial App ${currentVersion}`);
must(readmeDeclaresBaseline&&atLeast(currentVersion,"5.0.0"),"README no declara una baseline vigente compatible con la arquitectura 5.0.0");
must(!architecture.includes("finance_v3_")&&!architecture.includes("finanzas-v3-"),"ARCHITECTURE.md sigue presentando la arquitectura V3 sustituida como vigente");
must(nextAudit.includes("5.0.0")&&nextAudit.toLowerCase().includes("baseline"),"README_AUDIT_NEXT no cierra el roadmap anterior en la baseline 5.0");

must(pkg.scripts?.["audit:v500"]==="node scripts/audit-v500.mjs","Falta script audit:v500");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v500.mjs"),"audit:current no protege la baseline 5.0");
must(String(pkg.scripts?.["audit:release"]||"").includes("audit:current"),"audit:release debe delegar en la auditoría canónica actual");
must(String(pkg.scripts?.prebuild||"").includes("audit:release"),"prebuild debe ejecutar el gate consolidado de release");
must(ci.includes("npm run build"),"CI debe ejecutar el build, que aplica el prebuild consolidado");

if(failures.length){console.error("Financial App 5.0 architecture closure audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log(`Financial App 5.0 audit OK · ${runtimeFiles.length} archivos runtime sin loaders/RPC sustituidos · arquitectura y release probe canónicos`);
