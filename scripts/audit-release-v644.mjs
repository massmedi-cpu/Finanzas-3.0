import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.4_RELEASE.sql");
const migration=read("database/FINANCIAL_APP_6.4.4_RETIRE_LEGACY_MOVEMENT_AUTOMATION.sql");
const notes=read("docs/releases/6.4.4.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const family=currentVersion.match(/^6\.4\.(\d+)$/);

must(Boolean(family)&&Number(family?.[1]||-1)>=4,"APP_VERSION debe permanecer en 6.4.x con patch >= 4");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-movement-runtime-v644.mjs"),"audit:current no ejecuta limpieza de runtime 6.4.4");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v644.mjs"),"audit:current no ejecuta cierre 6.4.4");
for(const token of [
  "financial_app_6_4_4_requires_6_4_3_baseline",
  "financial_app_6_4_4_legacy_automation_still_active",
  "'app_version',to_jsonb('6.4.4'::text)",
  "'target_version',to_jsonb('6.4.4'::text)",
  "financial_app_6_4_4_metadata_alignment_failed",
  "financial_app_6_4_4_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.4 incompleto: ${token}`);
for(const token of ["financial_app_6_4_4_legacy_automation_has_history","drop table if exists financial_app.automation_runs"])
  must(migration.includes(token),`Retirada 6.4.4 incompleta: ${token}`);
for(const token of ["Financial App 6.4.4","0 ejecuciones","segundo matching documental","operaciones reversibles","3.4.8"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.4 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.4 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.4 release audit OK · baseline 6.4.4 protegida para patches 6.4.x posteriores");
