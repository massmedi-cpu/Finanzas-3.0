import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const release=read("database/FINANCIAL_APP_6.0.1_RELEASE.sql");
const archive=read("database/FINANCIAL_APP_6.0.1_ARCHIVE_PAGINATION.sql");
const globals=read("app/globals.css");
const notes=read("docs/releases/6.0.1.md");

const versionMatch=version.match(/APP_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
const versionTuple=versionMatch?versionMatch.slice(1).map(Number):[0,0,0];
const atLeast601=versionTuple[0]>6||(versionTuple[0]===6&&(versionTuple[1]>0||(versionTuple[1]===0&&versionTuple[2]>=1)));
must(atLeast601,"APP_VERSION debe conservar baseline >= 6.0.1");
must(pkg.version==="3.4.8","La versión técnica del paquete sigue siendo 3.4.8 por contrato");
must(pkg.scripts?.["audit:v601"]==="node scripts/audit-v601.mjs","Falta audit:v601");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v601.mjs"),"audit:current no ejecuta el gate 6.0.1");

for(const token of ["financial_app_6_0_1_requires_6_0_0_baseline","'app_version',to_jsonb('6.0.1'::text)","'target_version',to_jsonb('6.0.1'::text)","financial_app_6_0_1_metadata_alignment_failed","financial_app_6_0_1_manifest_alignment_failed"]){
  must(release.includes(token),`Release 6.0.1 incompleto: ${token}`);
}
for(const forbidden of ["update financial_app.transactions","delete from financial_app.transactions","update financial_app.documents","delete from financial_app.documents","update financial_app.accounts","delete from financial_app.accounts"]){
  must(!release.toLowerCase().includes(forbidden),`Release 6.0.1 no puede mutar datos: ${forbidden}`);
}

for(const token of ["archive_lifecycle_overview_core","financial_app_archive_lifecycle_overview","archive_document_state_core","archive_document_payload_core","p_state text default 'new'","p_limit integer default 40"]){
  must(archive.includes(token),`Archivo 6.0.1 incompleto: ${token}`);
}

for(const alias of ["--bg:","--surface:","--surface-2:","--surface-3:","--border:","--muted:","--text:","--accent:","--success:","--expense:","--radius-control:","--radius-overlay:","--radius-panel:"]){
  must(!globals.includes(alias),`Alias visual retirado ha reaparecido: ${alias}`);
}

for(const token of ["Financial App 6.0.1","paginación en servidor","14 px","44 px","3.150 movimientos","187.943,86 €"]){
  must(notes.includes(token),`Notas 6.0.1 incompletas: ${token}`);
}

if(failures.length){console.error("Financial App 6.0.1 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.0.1 baseline audit OK · Archivo paginado, visual semántico sin aliases y release metadata-only protegidos");
