import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.5.0_RELEASE.sql");
const notes=read("docs/releases/6.5.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const current=String(pkg.scripts?.["audit:current"]||"");

must(versionAtLeast(currentVersion,"6.5.0"),"APP_VERSION debe preservar como mínimo la baseline 6.5.0");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
must(current.includes("audit-visual-runtime-v650.mjs"),"audit:current no ejecuta el gate funcional 6.5.0");
must(current.includes("audit-release-v650.mjs"),"audit:current no ejecuta el cierre 6.5.0");
for(const token of [
  "financial_app_6_5_0_requires_6_4_11_baseline",
  "'app_version',to_jsonb('6.5.0'::text)",
  "'target_version',to_jsonb('6.5.0'::text)",
  "financial_app_6_5_0_metadata_alignment_failed",
  "financial_app_6_5_0_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.5.0 incompleto: ${token}`);
for(const token of [
  "Financial App 6.5.0",
  "visual.css",
  "3.292 bytes",
  "route-loading.css",
  "chart-tokens.css",
  "24 gráficos",
  "content-visibility:auto",
  "versionAtLeast",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.5.0 incompletas: ${token}`);

if(failures.length){
  console.error("Financial App 6.5.0 release audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.5.0 release audit OK · baseline preservada por ${currentVersion} · runtime visual y gates forward-compatible protegidos`);
