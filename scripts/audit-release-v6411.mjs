import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.11_RELEASE.sql");
const notes=read("docs/releases/6.4.11.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const family=currentVersion.match(/^6\.4\.(\d+)$/);

must(Boolean(family)&&Number(family?.[1]||0)>=11,"APP_VERSION debe pertenecer a 6.4.x desde patch 11");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-tablet-scope-v6411.mjs"),"audit:current no ejecuta el gate funcional 6.4.11");
must(current.includes("audit-release-v6411.mjs"),"audit:current no ejecuta el cierre 6.4.11");
for(const token of [
  "financial_app_6_4_11_requires_6_4_10_baseline",
  "'app_version',to_jsonb('6.4.11'::text)",
  "'target_version',to_jsonb('6.4.11'::text)",
  "financial_app_6_4_11_metadata_alignment_failed",
  "financial_app_6_4_11_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.11 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.11",
  "tablet.css",
  "Movimientos",
  "Archivo",
  "640 bytes",
  "regla muerta",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.11 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.11 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.11 release audit OK · baseline preservada por ${currentVersion} · CSS tablet acotado`);
