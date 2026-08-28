import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.4.3_RELEASE.sql");
const notes=read("docs/releases/6.4.3.md");
const workflow=read(".github/workflows/production-smoke.yml");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const [major,minor,patch]=currentVersion.split(".").map(Number);

must(major===6&&minor===4&&patch>=3,"APP_VERSION debe preservar la baseline 6.4.3 dentro de la familia 6.4.x");
must(pkg.version==="3.4.8","La versión técnica del paquete permanece 3.4.8 por contrato");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-reliability-v643.mjs"),"audit:current no ejecuta fiabilidad 6.4.3");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-release-v643.mjs"),"audit:current no ejecuta el cierre 6.4.3");
for(const token of ["financial_app_6_4_3_requires_6_4_2_baseline","'app_version',to_jsonb('6.4.3'::text)","'target_version',to_jsonb('6.4.3'::text)","financial_app_6_4_3_metadata_alignment_failed","financial_app_6_4_3_manifest_alignment_failed"])
  must(release.includes(token),`Release 6.4.3 incompleto: ${token}`);
for(const token of ["Financial App 6.4.3","dos pasadas consecutivas","seis rutas privadas","cinco APIs protegidas","3.4.8","Cero previews"])
  must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 6.4.3 incompletas: ${token}`);
for(const token of ["Wait for globally consistent production version","stable_passes","Production did not become globally consistent"])
  must(workflow.includes(token),`Production smoke 6.4.3 incompleto: ${token}`);

if(failures.length){console.error("Financial App 6.4.3 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.3 release audit OK · baseline preservada por 6.4.x, propagación global estable y gates forward-compatible");
