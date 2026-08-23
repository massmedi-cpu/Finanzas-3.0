import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS=["app","components","lib","database","scripts",".github"];
const EXT=/\.(?:ts|tsx|js|mjs|cjs|sql|json|ya?ml)$/i;
const runtimeRoots=["app/","components/","lib/"];
const errors=[];
const warnings=[];
const stats={files:0,lines:0,bytes:0,byRoot:{}};

function walk(dir){
  if(!existsSync(dir))return[];
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name);
    const st=statSync(path);
    return st.isDirectory()?walk(path):[path];
  });
}
function isRuntime(path){return runtimeRoots.some(root=>path.startsWith(root));}
function lineNumber(text,index){return text.slice(0,index).split(/\r?\n/).length;}
function addMatch(bucket,path,text,regex,label){
  for(const match of text.matchAll(regex))bucket.push(`${path}:${lineNumber(text,match.index??0)} · ${label}`);
}

const files=ROOTS.flatMap(root=>walk(root)).filter(path=>EXT.test(path));
for(const path of files){
  const text=readFileSync(path,"utf8");
  const root=ROOTS.find(root=>path===root||path.startsWith(`${root}/`))||"other";
  stats.files++;stats.lines+=text.split(/\r?\n/).length;stats.bytes+=Buffer.byteLength(text);
  stats.byRoot[root]=(stats.byRoot[root]||0)+1;

  if(isRuntime(path)){
    addMatch(errors,path,text,/\bdebugger\s*;/g,"debugger residual");
    addMatch(errors,path,text,/\beval\s*\(/g,"eval no permitido");
    addMatch(errors,path,text,/\bnew\s+Function\s*\(/g,"new Function no permitido");
    addMatch(errors,path,text,/dangerouslySetInnerHTML/g,"HTML sin escapar no permitido");
    addMatch(errors,path,text,/from\s+["']node:child_process["']|from\s+["']child_process["']/g,"child_process no permitido en runtime");
    addMatch(errors,path,text,/\/\/@ts-ignore|\/\/@ts-nocheck|\/\*\s*@ts-ignore|\/\*\s*@ts-nocheck/g,"supresión TypeScript no permitida");
    addMatch(errors,path,text,/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,"catch vacío silencia errores");
    addMatch(errors,path,text,/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g,"localhost hardcodeado en runtime");
    addMatch(errors,path,text,/new Date\(\)\.toISOString\(\)\.slice\(0,(?:7|10)\)/g,"periodo derivado de UTC; usar zona Europe/Madrid");
    if(text.startsWith('"use client"')||text.startsWith("'use client'")){
      addMatch(errors,path,text,/process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/g,"variable privada expuesta desde componente cliente");
    }
    addMatch(warnings,path,text,/\bconsole\.log\s*\(/g,"console.log residual");
    addMatch(warnings,path,text,/\b(?:TODO|FIXME|HACK|XXX)\b/g,"deuda técnica marcada");
    addMatch(warnings,path,text,/\bany\b/g,"uso de any a revisar");
  }
}

const apiRoutes=files.filter(path=>/^app\/api\/.+\/route\.ts$/.test(path));
for(const path of apiRoutes){
  const text=readFileSync(path,"utf8");
  const mutates=/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/.test(text);
  const hasAuth=/getAuthorizedClient|requireAuthorizedUser|authorizedClient\s*\(|hasFinancialAppAccess|auth\.get(?:User|Claims)\s*\(/.test(text);
  if(mutates&&!hasAuth)errors.push(`${path}:1 · endpoint mutador sin comprobación de autorización visible`);
  const getBlock=text.match(/export\s+async\s+function\s+GET\b[\s\S]*?(?=export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)|$)/)?.[0]||"";
  if(getBlock&&/\.rpc\(\s*["'][^"']*(?:upsert|insert|delete|deactivate|apply|revert|restore|sync|update|create|close|reopen)[^"']*["']/.test(getBlock))errors.push(`${path}:1 · GET parece ejecutar una RPC con efecto lateral`);
}

for(const required of [
  "app/reglas/page.tsx","app/reglas/rules-client.tsx","app/api/rules/route.ts",
  "lib/format/es-es.ts","lib/auth/authorized-client.ts","vercel.json",".github/workflows/ci.yml"
])if(!existsSync(required))errors.push(`${required}:1 · archivo crítico ausente`);

const vercel=existsSync("vercel.json")?readFileSync("vercel.json","utf8"):"";
if(!vercel.includes('"develop/v2.6.0-rules": false'))errors.push("vercel.json:1 · Vercel debe permanecer desactivado para 2.6 durante desarrollo");
const ci=existsSync(".github/workflows/ci.yml")?readFileSync(".github/workflows/ci.yml","utf8"):"";
if(!ci.includes("develop/v2.6.0-rules"))errors.push(".github/workflows/ci.yml:1 · la rama 2.6 no está protegida por CI");
if(!ci.includes("'develop/**'"))errors.push(".github/workflows/ci.yml:1 · los PR apilados develop/** no están protegidos");

const runtimeFiles=files.filter(isRuntime).length;
const coverage=files.length?100:0;
console.log(`Financial App 2.6 full audit · ${stats.files} archivos · ${stats.lines} líneas · ${stats.bytes} bytes · runtime ${runtimeFiles} archivos · cobertura ${coverage}%`);
console.log(`Distribución: ${Object.entries(stats.byRoot).map(([root,count])=>`${root}=${count}`).join(" · ")}`);
if(warnings.length){console.log(`WARNINGS (${warnings.length})`);warnings.slice(0,200).forEach(w=>console.log(`- ${w}`));if(warnings.length>200)console.log(`- … ${warnings.length-200} warnings adicionales`);}
if(errors.length){console.error(`ERRORS (${errors.length})`);errors.forEach(e=>console.error(`- ${e}`));process.exit(1);}
console.log("Financial App 2.6 full audit OK · 100% del árbol activo inspeccionado sin hallazgos críticos");
