import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const enforced=process.env.VERCEL==="1"||process.env.CI==="true";
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"";

if(!url||!key){
  if(enforced){
    console.error("Supabase release preflight FAILED · faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    process.exit(1);
  }
  console.log("Supabase release preflight omitido fuera de CI/Vercel · variables no configuradas");
  process.exit(0);
}

const versionSource=fs.readFileSync(path.join(root,"lib/app-version.ts"),"utf8");
const version=versionSource.match(/APP_VERSION\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+)["']/)?.[1]||"";
if(!version){
  console.error("Supabase release preflight FAILED · APP_VERSION no reconocible");
  process.exit(1);
}

const sourceRoots=["app","lib","components","supabase/functions"];
const extensions=new Set([".ts",".tsx",".js",".mjs"]);
const required=new Set();

function visit(target){
  if(!fs.existsSync(target))return;
  const stat=fs.statSync(target);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(target))visit(path.join(target,entry));
    return;
  }
  if(!extensions.has(path.extname(target)))return;
  const source=fs.readFileSync(target,"utf8");
  for(const match of source.matchAll(/\brpc\s*\(\s*["'`](financial_app_[a-zA-Z0-9_]+)["'`]/g))required.add(match[1]);
  for(const match of source.matchAll(/\/rpc\/(financial_app_[a-zA-Z0-9_]+)/g))required.add(match[1]);
}
for(const sourceRoot of sourceRoots)visit(path.join(root,sourceRoot));

const functions=[...required].map(value=>value.toLowerCase()).sort();
if(!functions.length){
  console.error("Supabase release preflight FAILED · no se detectaron RPCs financial_app_ en el código");
  process.exit(1);
}
if(functions.length>200){
  console.error(`Supabase release preflight FAILED · ${functions.length} RPCs superan el límite de 200`);
  process.exit(1);
}

let response;
try{
  response=await fetch(`${url}/rest/v1/rpc/financial_app_release_preflight`,{
    method:"POST",
    headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json","cache-control":"no-store"},
    body:JSON.stringify({p_expected_version:version,p_required_functions:functions}),
    signal:AbortSignal.timeout(12000),
  });
}catch(error){
  console.error(`Supabase release preflight FAILED · conexión: ${error instanceof Error?error.message:String(error)}`);
  process.exit(1);
}

const raw=await response.text();
let payload;
try{payload=raw?JSON.parse(raw):null;}catch{payload=null;}
if(!response.ok||!payload||typeof payload!=="object"){
  console.error(`Supabase release preflight FAILED · HTTP ${response.status} · ${raw.slice(0,300)}`);
  process.exit(1);
}

const missing=Array.isArray(payload.missing)?payload.missing:[];
if(payload.ok!==true){
  console.error("Supabase release preflight FAILED");
  console.error(`- código: ${version}`);
  console.error(`- DB app: ${payload.appVersion??"desconocida"}`);
  console.error(`- DB target: ${payload.targetVersion??"desconocida"}`);
  if(missing.length)console.error(`- RPCs ausentes: ${missing.join(", ")}`);
  if(payload.error)console.error(`- error: ${payload.error}`);
  process.exit(1);
}

console.log(`Supabase release preflight OK · Financial App ${version} · ${functions.length} RPCs presentes en producción`);
