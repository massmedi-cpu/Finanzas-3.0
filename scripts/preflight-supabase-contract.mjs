import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const enforced=process.env.VERCEL==="1"||process.env.CI==="true";
const exactMode=process.argv.includes("--exact");
const configSource=fs.readFileSync(path.join(root,"lib/supabase/config.ts"),"utf8");
const fallbackUrl=configSource.match(/FALLBACK_SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1]||"";
const fallbackKey=configSource.match(/FALLBACK_SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/)?.[1]||"";
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||fallbackUrl).replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||fallbackKey;

if(!url||!key){
  if(enforced){
    console.error("Supabase release preflight FAILED · configuración pública de Supabase no disponible");
    process.exit(1);
  }
  console.log("Supabase release preflight omitido fuera de CI/Vercel · configuración no disponible");
  process.exit(0);
}

const versionSource=fs.readFileSync(path.join(root,"lib/app-version.ts"),"utf8");
const version=versionSource.match(/APP_VERSION\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+)["']/)?.[1]||"";
if(!version){
  console.error("Supabase release preflight FAILED · APP_VERSION no reconocible");
  process.exit(1);
}

const releaseMigrationPath=path.join(root,"database",`FINANCIAL_APP_${version.replaceAll(".","_")}_RELEASE.sql`);
let baselineVersion=version;
if(fs.existsSync(releaseMigrationPath)){
  const releaseMigration=fs.readFileSync(releaseMigrationPath,"utf8");
  const baselineMatch=releaseMigration.match(/requires_(\d+)_(\d+)_(\d+)_baseline/i);
  if(baselineMatch)baselineVersion=`${baselineMatch[1]}.${baselineMatch[2]}.${baselineMatch[3]}`;
}
const acceptedVersions=exactMode?[version]:[...new Set([version,baselineVersion])];

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

async function requestPreflight(expectedVersion){
  let response;
  try{
    response=await fetch(`${url}/rest/v1/rpc/financial_app_release_preflight`,{
      method:"POST",
      headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json","cache-control":"no-store"},
      body:JSON.stringify({p_expected_version:expectedVersion,p_required_functions:functions}),
      signal:AbortSignal.timeout(12000),
    });
  }catch(error){
    throw new Error(`conexión: ${error instanceof Error?error.message:String(error)}`);
  }

  const raw=await response.text();
  let payload;
  try{payload=raw?JSON.parse(raw):null;}catch{payload=null;}
  if(!response.ok||!payload||typeof payload!=="object"){
    throw new Error(`HTTP ${response.status} · ${raw.slice(0,300)}`);
  }
  return {expectedVersion,payload};
}

const attempts=[];
for(const expectedVersion of acceptedVersions){
  let result;
  try{result=await requestPreflight(expectedVersion);}catch(error){
    console.error(`Supabase release preflight FAILED · ${error instanceof Error?error.message:String(error)}`);
    process.exit(1);
  }
  attempts.push(result);
  if(result.payload.ok===true){
    const mode=exactMode?"release exacto":(expectedVersion===version?"candidato ya alineado":"candidato sobre baseline");
    console.log(`Supabase release preflight OK · ${mode} · código ${version} · DB ${expectedVersion} · ${functions.length} RPCs presentes en producción`);
    process.exit(0);
  }
}

console.error("Supabase release preflight FAILED");
console.error(`- código: ${version}`);
console.error(`- versiones DB aceptadas en este modo: ${acceptedVersions.join(" o ")}`);
for(const {expectedVersion,payload} of attempts){
  const missing=Array.isArray(payload.missing)?payload.missing:[];
  console.error(`- intento ${expectedVersion}: DB app ${payload.appVersion??"desconocida"} · DB target ${payload.targetVersion??"desconocida"}`);
  if(missing.length)console.error(`- RPCs ausentes: ${missing.join(", ")}`);
  if(payload.error)console.error(`- error: ${payload.error}`);
}
process.exit(1);
