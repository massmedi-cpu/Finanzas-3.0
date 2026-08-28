import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.10_RELEASE.sql");
const notes=read("docs/releases/6.4.10.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";

must(versionAtLeast(currentVersion,"6.4.10"),"APP_VERSION debe preservar como mínimo la baseline 6.4.10");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-css-scope-v6410.mjs"),"audit:current no ejecuta el gate funcional 6.4.10");
must(current.includes("audit-release-v6410.mjs"),"audit:current no ejecuta el cierre 6.4.10");
for(const token of [
  "financial_app_6_4_10_requires_6_4_9_baseline",
  "'app_version',to_jsonb('6.4.10'::text)",
  "'target_version',to_jsonb('6.4.10'::text)",
  "financial_app_6_4_10_metadata_alignment_failed",
  "financial_app_6_4_10_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.10 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.10",
  "document-linking.css",
  "Archivo",
  "Movimientos",
  "2.083",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.10 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.10 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.10 release audit OK · baseline preservada por ${currentVersion} · CSS compartido acotado`);
