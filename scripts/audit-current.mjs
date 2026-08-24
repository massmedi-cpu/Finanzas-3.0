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
const versionMatch=appVersion.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica y explícita");
if(versionMatch){const current=versionMatch.slice(1).map(Number);const minimum=[3,3,1];const ok=current[0]>minimum[0]||(current[0]===minimum[0]&&(current[1]>minimum[1]||(current[1]===minimum[1]&&current[2]>=minimum[2])));must(ok,"La versión activa debe incluir las garantías documentales de 3.3.1 o posteriores");}

const movementDocuments=read("app/movimientos/movement-documents.tsx");
must(movementDocuments.includes("Factura / ticket relacionado"),"Cada detalle de movimiento debe identificar claramente la documentación relacionada");
must(movementDocuments.includes("Ver en Google Drive")&&movementDocuments.includes("document.storageUrl"),"Los documentos de Drive deben abrir el original mediante su URL de Google Drive");
must(movementDocuments.includes("fecha real de compra")&&movementDocuments.includes("OCR intentará vincularlo automáticamente"),"La UI debe explicar la vinculación por fecha real y el flujo de tickets fotografiados");
const archiveApi=read("app/api/archive/[id]/route.ts");
must(archiveApi.includes('financial_app_auto_link_documents'),"Guardar OCR/metadatos de un ticket debe volver a intentar su vinculación automática");
must(archiveApi.includes('storageProvider==="google_drive"')&&archiveApi.includes("externalOriginalPreserved"),"Los originales de Google Drive deben abrirse directamente y nunca eliminarse desde Financial App");
const driveMigration="database/FINANCIAL_APP_3.3.1_DRIVE_MATCH_DATE.sql";
must(fs.existsSync(driveMigration),"Falta la migración canónica de fecha real para documentos Drive");
if(fs.existsSync(driveMigration)){
  const migration=read(driveMigration);
  for(const token of ["transaction_match_date","source_original_concept","drive_exact","document_candidates=1","transaction_candidates=1","storage_provider='google_drive'"])
    must(migration.includes(token),`La vinculación documental ha perdido la garantía: ${token}`);
}

const vercel=read("vercel.json");
for(const pattern of ["audit/**","chore/**","develop/**","feat/**","fix/**","hotfix/**","release/**"])
  must(vercel.includes(`"${pattern}": false`),`Vercel debe bloquear previews automáticos de ${pattern}`);

const sensitivePatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/,/GOOGLE_CLIENT_SECRET\s*=\s*[^$\s]/];
for(const file of files){const source=read(file);for(const pattern of sensitivePatterns)must(!pattern.test(source),`Posible secreto incrustado en ${file}`);}

if(failures.length){console.error("Canonical architecture audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Canonical architecture audit OK · ${files.length} archivos runtime inspeccionados · Drive/movimientos y arquitectura canónica protegidos`);
