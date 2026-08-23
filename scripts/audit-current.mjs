import fs from "node:fs";
import path from "node:path";

const roots=["app","components","lib"];
const textExtensions=new Set([".ts",".tsx",".js",".mjs",".css"]);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(textExtensions.has(path.extname(entry.name)))files.push(full.replaceAll("\\","/"));}}
for(const root of roots)walk(root);
const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const obsoleteRuntimePatterns=[/\/[^/]+-v\d+(?:\.\d+)*\.css$/i,/\/[^/]+-advanced\.css$/i];
for(const file of files)for(const pattern of obsoleteRuntimePatterns)must(!pattern.test(`/${file}`),`Capa de estilos histórica/paralela activa: ${file}`);

for(const file of files.filter(file=>/\.(?:ts|tsx|js|mjs)$/.test(file))){
  const source=read(file);
  const incompleteMarker=/(?:^|\n)\s*(?:\/\/|\/\*|\*)\s*(?:TODO|FIXME|WIP)\b/i;
  must(!incompleteMarker.test(source),`Marcador de trabajo incompleto en ${file}`);
  must(!/catch\s*(?:\([^)]*\))?\s*\{\s*\}/m.test(source),`catch vacío en ${file}`);
}

const cssFiles=files.filter(file=>file.endsWith(".css"));
const sharedControlSelectors=new Set([
  "button",".primary-action",".ghost",".danger-action",".icon-button",".button-link",
  "button:disabled","[aria-disabled=\"true\"]","button[aria-busy=\"true\"]","a[aria-busy=\"true\"]",
  ".inline-alert",".inline-alert.success",".inline-alert.error",".empty-state",".empty-state strong"
]);
function splitSelectorList(prelude){
  const selectors=[];let current="",round=0,square=0;
  for(const char of prelude){
    if(char==="(")round++;else if(char===")")round=Math.max(0,round-1);
    else if(char==="[")square++;else if(char==="]")square=Math.max(0,square-1);
    if(char===","&&round===0&&square===0){if(current.trim())selectors.push(current.trim());current="";continue;}
    current+=char;
  }
  if(current.trim())selectors.push(current.trim());
  return selectors;
}
function cssSelectors(source){
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,"");
  const selectors=[];
  for(const match of clean.matchAll(/([^{}]+)\{/g)){
    const prelude=String(match[1]||"").trim();
    if(!prelude||prelude.startsWith("@"))continue;
    selectors.push(...splitSelectorList(prelude));
  }
  return selectors;
}
for(const file of cssFiles){
  const selectors=cssSelectors(read(file));
  if(file!=="app/controls.css"){
    for(const selector of selectors)must(!sharedControlSelectors.has(selector),`Selector compartido ${selector} redefinido fuera de controls.css: ${file}`);
    for(const selector of selectors){
      const unscopedState=/^\.(?:primary-action|ghost|danger-action|icon-button|button-link|inline-alert|empty-state)(?=[:[])/.test(selector);
      must(!unscopedState,`Estado de control compartido redefinido sin ámbito fuera de controls.css: ${selector} en ${file}`);
    }
  }
}
const controls=read("app/controls.css");
for(const token of ["button{font:inherit}",".primary-action{","background:var(--accent)",".ghost{",".danger-action{",".icon-button{",".button-link{display:inline-flex",".inline-alert{",".empty-state{","button:disabled","button[aria-busy=\"true\"]",".primary-action[aria-busy=\"true\"]::before"])
  must(controls.includes(token),`controls.css ha perdido la garantía compartida: ${token}`);

const globals=read("app/globals.css");
must(globals.includes('html[data-theme="light"]')&&globals.includes('html[data-theme="dark"]'),"La paleta de tema manual debe vivir en globals.css");
const settingsCss=read("app/settings.css");
must(!settingsCss.includes(':root[data-theme="light"]')&&!settingsCss.includes(':root[data-theme="dark"]'),"Configuración no puede ser propietaria de la paleta global");
const movementsCss=read("app/movements.css");
must(!movementsCss.includes(".sidebar nav")&&!movementsCss.includes(".sidebar{"),"Movimientos no puede redefinir la navegación global");

const rootLayout=read("app/layout.tsx");
for(const forbidden of ["cash-flow.css","explainability.css","integrity.css","analysis.css","plan.css","budget.css","movements.css"])
  must(!rootLayout.includes(forbidden),`El layout raíz carga CSS específico de módulo: ${forbidden}`);
must(rootLayout.includes('import "./globals.css"')&&rootLayout.includes('import "./controls.css"')&&rootLayout.indexOf('import "./controls.css"')>rootLayout.indexOf('import "./globals.css"'),"controls.css debe cargarse una sola vez después de globals.css");

const routeStyleContracts=[
  ["app/analisis/layout.tsx","analysis.css"],
  ["app/plan/layout.tsx","plan.css"],
  ["app/presupuesto/layout.tsx","budget.css"],
  ["app/movimientos/layout.tsx","movements.css"],
  ["app/cash-flow/layout.tsx","cash-flow.css"],
  ["app/control/layout.tsx","integrity.css"],
  ["app/explicabilidad/layout.tsx","explainability.css"],
];
for(const [file,token] of routeStyleContracts){must(fs.existsSync(file),`Falta layout canónico ${file}`);if(fs.existsSync(file))must(read(file).includes(token),`${file} no carga ${token}`);}

must(!fs.existsSync("lib/document/ticket-ocr-v305.ts"),"Permanece el motor OCR v305 sustituido");
const tsconfig=read("tsconfig.json");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"El OCR público no apunta al motor canónico");
const appVersion=read("lib/app-version.ts");
must(appVersion.includes('APP_VERSION = "3.2.1"'),"La versión de producto no es 3.2.1");

const vercel=read("vercel.json");
for(const pattern of ["audit/**","chore/**","develop/**","feat/**","fix/**","hotfix/**","release/**"])
  must(vercel.includes(`"${pattern}": false`),`Vercel debe bloquear previews automáticos de ${pattern}`);

const sensitivePatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/,/GOOGLE_CLIENT_SECRET\s*=\s*[^$\s]/];
for(const file of files){const source=read(file);for(const pattern of sensitivePatterns)must(!pattern.test(source),`Posible secreto incrustado en ${file}`);}

if(failures.length){console.error("Canonical architecture audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Canonical architecture audit OK · ${files.length} archivos runtime inspeccionados · controles/tema con propietario único, arquitectura canónica y previews protegidos`);
