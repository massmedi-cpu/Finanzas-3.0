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

const rootLayout=read("app/layout.tsx");
for(const forbidden of ["cash-flow.css","explainability.css","integrity.css","analysis.css","plan.css","budget.css","movements.css"])
  must(!rootLayout.includes(forbidden),`El layout raíz carga CSS específico de módulo: ${forbidden}`);

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
must(appVersion.includes('APP_VERSION = "3.2.0"'),"La versión de producto no es 3.2.0");

const sensitivePatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/,/GOOGLE_CLIENT_SECRET\s*=\s*[^$\s]/];
for(const file of files){const source=read(file);for(const pattern of sensitivePatterns)must(!pattern.test(source),`Posible secreto incrustado en ${file}`);}

if(failures.length){console.error("Canonical architecture audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Canonical architecture audit OK · ${files.length} archivos runtime inspeccionados · sin capas CSS históricas/paralelas, marcadores incompletos ni catch vacíos`);
