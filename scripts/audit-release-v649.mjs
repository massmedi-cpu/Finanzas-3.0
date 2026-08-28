import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.9_RELEASE.sql");
const notes=read("docs/releases/6.4.9.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const family=currentVersion.match(/^6\.4\.(\d+)$/);

must(Boolean(family)&&Number(family?.[1]||0)>=9,"APP_VERSION debe pertenecer a 6.4.x desde patch 9");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
const current=String(pkg.scripts?.["audit:current"]||"");
must(current.includes("audit-css-scope-v649.mjs"),"audit:current no ejecuta el gate funcional 6.4.9");
must(current.includes("audit-release-v649.mjs"),"audit:current no ejecuta el cierre 6.4.9");
for(const token of [
  "financial_app_6_4_9_requires_6_4_8_baseline",
  "'app_version',to_jsonb('6.4.9'::text)",
  "'target_version',to_jsonb('6.4.9'::text)",
  "financial_app_6_4_9_metadata_alignment_failed",
  "financial_app_6_4_9_manifest_alignment_failed"
]) must(release.includes(token),`Release 6.4.9 incompleto: ${token}`);
for(const token of [
  "Financial App 6.4.9",
  "home.css",
  "archive-review.css",
  "11.251",
  "document-linking.css",
  "3.4.8"
]) must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.9 incompletas: ${token}`);

if(failures.length){console.error("Financial App 6.4.9 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 6.4.9 release audit OK · baseline preservada por ${currentVersion} · alcance CSS protegido`);
