import fs from "node:fs";
import path from "node:path";

const root=path.join(process.cwd(),"app/api");
const failures=[];
const routes=[];

function visit(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const target=path.join(dir,entry.name);
    if(entry.isDirectory())visit(target);
    else if(entry.isFile()&&entry.name==="route.ts")routes.push(target);
  }
}
visit(root);

for(const file of routes){
  const source=fs.readFileSync(file,"utf8");
  const relative=path.relative(process.cwd(),file);
  if(!source.includes("@/lib/api/response"))failures.push(`${relative}: no usa la frontera API común`);
  if(/\b(?:error|readError|current\.error|detail\.error|deleted\.error)\s*\??\.message\b/.test(source)||/instanceof\s+Error\s*\?[^:\n]*\.message/.test(source))failures.push(`${relative}: expone o manipula mensajes crudos de error`);
  if(source.includes("NextResponse.json("))failures.push(`${relative}: conserva respuestas JSON fuera de la frontera común`);
}

const helper=fs.readFileSync("lib/api/response.ts","utf8");
for(const token of ["API_NO_STORE_HEADERS","apiUnauthorized","apiFailure","publicApiErrorCode","financial_app_api_failure"]){
  if(!helper.includes(token))failures.push(`lib/api/response.ts: falta ${token}`);
}
if(!helper.includes('"Cache-Control": "private, no-store"'))failures.push("lib/api/response.ts: falta no-store canónico");

if(failures.length){
  console.error("Financial App API boundary audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App API boundary audit OK · ${routes.length} rutas sanitizadas y no-store centralizado`);
