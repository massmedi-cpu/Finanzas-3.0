import{existsSync,readFileSync,readdirSync,statSync}from"node:fs";import{join}from"node:path";
const errors=[];const required=["lib/format/es-es.ts","scripts/number-format-v250-tests.ts","app/control/control-client.tsx","lib/financial/control.ts","app/api/control/route.ts"];
for(const file of required)if(!existsSync(file))errors.push(`Falta ${file}`);
const walk=dir=>!existsSync(dir)?[]:readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path]});
for(const file of [...walk("app"),...walk("components"),...walk("lib")].filter(path=>/\.(ts|tsx)$/.test(path)&&path!=="lib/format/es-es.ts")){
  const text=readFileSync(file,"utf8");const lines=text.split(/\r?\n/);
  lines.forEach((line,index)=>{if(line.includes("Intl.NumberFormat"))errors.push(`${file}:${index+1}: ${line.trim()}`);});
  lines.forEach((line,index)=>{if(/toLocaleString\(\s*["']es-ES["']/.test(line)&&/(?:minimum|maximum)FractionDigits/.test(line))errors.push(`${file}:${index+1}: ${line.trim()}`);});
}
if(existsSync("lib/format/es-es.ts")){
  const format=readFileSync("lib/format/es-es.ts","utf8");
  for(const token of ["integer.replace(/\\B(?=(\\d{3})+(?!\\d))/g,\".\")","split(\",\")","formatEuro","formatInteger","formatPercent","ES_NUMBER_FORMAT_RULE=\"1.234.567,89\""])if(!format.includes(token))errors.push(`Falta garantía de formato: ${token}`);
}
const vercel=existsSync("vercel.json")?readFileSync("vercel.json","utf8"):"";
if(!vercel.includes('"develop/v2.5.0-month-close": false'))errors.push("Vercel no está bloqueado para develop/v2.5.0-month-close");
if(errors.length){console.error("Financial App 2.5 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.5 audit OK · cierre mensual protegido y formato numérico España centralizado");
