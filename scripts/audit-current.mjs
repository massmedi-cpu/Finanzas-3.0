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
for(const file of files.filter(file=>/\.(?:ts|tsx|js|mjs)$/.test(file))){const source=read(file);must(!/(?:^|\n)\s*(?:\/\/|\/\*|\*)\s*(?:TODO|FIXME|WIP)\b/i.test(source),`Marcador de trabajo incompleto en ${file}`);must(!/catch\s*(?:\([^)]*\))?\s*\{\s*\}/m.test(source),`catch vacío en ${file}`);}

const cssFiles=files.filter(file=>file.endsWith(".css"));
const sharedControlSelectors=new Set(["button",".primary-action",".ghost",".danger-action",".danger-button",".icon-button",".button-link","button:disabled","[aria-disabled=\"true\"]","button[aria-busy=\"true\"]","a[aria-busy=\"true\"]",".inline-alert",".inline-alert.success",".inline-alert.error",".empty-state",".empty-state strong"]);
function splitSelectorList(prelude){const selectors=[];let current="",round=0,square=0;for(const char of prelude){if(char==="(")round++;else if(char===")")round=Math.max(0,round-1);else if(char==="[")square++;else if(char==="]")square=Math.max(0,square-1);if(char===","&&round===0&&square===0){if(current.trim())selectors.push(current.trim());current="";continue;}current+=char;}if(current.trim())selectors.push(current.trim());return selectors;}
function cssSelectors(source){const clean=source.replace(/\/\*[\s\S]*?\*\//g,"");const selectors=[];for(const match of clean.matchAll(/([^{}]+)\{/g)){const prelude=String(match[1]||"").trim();if(!prelude||prelude.startsWith("@"))continue;selectors.push(...splitSelectorList(prelude));}return selectors;}
for(const file of cssFiles){const selectors=cssSelectors(read(file));if(file!=="app/controls.css"){for(const selector of selectors)must(!sharedControlSelectors.has(selector),`Selector compartido ${selector} redefinido fuera de controls.css: ${file}`);for(const selector of selectors)must(!/^\.(?:primary-action|ghost|danger-action|danger-button|icon-button|button-link|inline-alert|empty-state)(?=[:[])/.test(selector),`Estado de control compartido redefinido sin ámbito fuera de controls.css: ${selector} en ${file}`);}}
const controls=read("app/controls.css");
for(const token of ["button{font:inherit}",".primary-action{","background:var(--accent-primary)",".ghost{",".danger-action,.danger-button{",".danger-button:hover:not(:disabled)",".icon-button{",".button-link{display:inline-flex",".inline-alert{",".empty-state{","button:disabled","button[aria-busy=\"true\"]",".primary-action[aria-busy=\"true\"]::before"])must(controls.includes(token),`controls.css ha perdido la garantía compartida: ${token}`);
const globals=read("app/globals.css");
must(globals.includes('html[data-theme="light"]')&&globals.includes('html[data-theme="dark"]'),"La paleta de tema manual debe vivir en globals.css");
const settingsCss=read("app/settings.css");must(!settingsCss.includes(':root[data-theme="light"]')&&!settingsCss.includes(':root[data-theme="dark"]'),"Configuración no puede ser propietaria de la paleta global");
const movementsCss=read("app/movements.css");must(!movementsCss.includes(".sidebar nav")&&!movementsCss.includes(".sidebar{"),"Movimientos no puede redefinir la navegación global");
const planCss=read("app/plan.css");must(!planCss.includes(".plan-month input{"),"Plan no debe recuperar geometría local de input: controls.css es la fuente canónica");

const rootLayout=read("app/layout.tsx");
for(const forbidden of ["cash-flow.css","explainability.css","integrity.css","analysis.css","plan.css","budget.css","movements.css","editor-dialog.css"])must(!rootLayout.includes(forbidden),`El layout raíz carga CSS específico de módulo: ${forbidden}`);
const routeStyleContracts=[["app/analisis/layout.tsx","analysis.css"],["app/plan/layout.tsx","plan.css"],["app/presupuesto/layout.tsx","budget.css"],["app/movimientos/layout.tsx","movements.css"],["app/cash-flow/layout.tsx","cash-flow.css"],["app/control/layout.tsx","integrity.css"],["app/explicabilidad/layout.tsx","explainability.css"]];
for(const [file,token] of routeStyleContracts){must(fs.existsSync(file),`Falta layout canónico ${file}`);if(fs.existsSync(file))must(read(file).includes(token),`${file} no carga ${token}`);}

must(!fs.existsSync("lib/document/ticket-ocr-v305.ts"),"Permanece el motor OCR v305 sustituido");
const tsconfig=read("tsconfig.json");must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"El OCR público no apunta al motor canónico");
const serverOcr=read("app/api/ocr/receipt/route.ts");
for(const token of ["queueTail: Promise<void> = Promise.resolve()","withExclusiveOcr","queueTail = previous.then(() => slot)","assertRuntimeAssets()","runtimeRootChecked","invalidateWorker()","OCR_QUEUE_TIMEOUT_MS = 8_000","OCR_TIMEOUT_MS = 45_000"])
  must(serverOcr.includes(token),`OCR de servidor ha perdido resiliencia de cola/runtime: ${token}`);
must(!serverOcr.includes("let queue: Promise<void> = Promise.resolve()"),"OCR no puede recuperar la cola desacoplada que permitía solapar reconocimientos tras timeout");
const topLevelAssetGuard=serverOcr.indexOf("for (const runtimeFile of OCR_RUNTIME_FILES)");
const assetGuardFunction=serverOcr.indexOf("function assertRuntimeAssets()");
must(topLevelAssetGuard>assetGuardFunction,"Los assets OCR deben validarse de forma perezosa dentro de assertRuntimeAssets, no al importar la ruta");
const appVersion=read("lib/app-version.ts");
const versionMatch=appVersion.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);must(Boolean(versionMatch),"APP_VERSION debe ser semántica y explícita");
const runtimeVersion=versionMatch?versionMatch.slice(1).join("."):null;
if(versionMatch){const current=versionMatch.slice(1).map(Number),minimum=[3,3,1];const ok=current[0]>minimum[0]||(current[0]===minimum[0]&&(current[1]>minimum[1]||(current[1]===minimum[1]&&current[2]>=minimum[2])));must(ok,"La versión activa debe incluir las garantías documentales de 3.3.1 o posteriores");}
const packageJson=JSON.parse(read("package.json"));const packageLock=JSON.parse(read("package-lock.json"));const lockRoot=packageLock.packages?.[""];
// package.json versiona el paquete técnico; APP_VERSION versiona el producto visible. No deben acoplarse.
must(packageLock.version===packageJson.version&&lockRoot?.version===packageJson.version,"package-lock.json debe conservar exactamente la versión técnica de package.json");
must(Boolean(runtimeVersion),"La versión visible del producto debe proceder de APP_VERSION");

const movementDocuments=read("app/movimientos/movement-documents.tsx");
must(movementDocuments.includes("Factura / ticket relacionado"),"Cada detalle de movimiento debe identificar claramente la documentación relacionada");
must(movementDocuments.includes("Ver en Google Drive")&&movementDocuments.includes("document.storageUrl"),"Los documentos de Drive deben abrir el original mediante su URL de Google Drive");
must(movementDocuments.includes("fecha real de compra")&&movementDocuments.includes("OCR intentará vincularlo automáticamente"),"La UI debe explicar la vinculación por fecha real y el flujo de tickets fotografiados");
const archiveApi=read("app/api/archive/[id]/route.ts");
must(archiveApi.includes('financial_app_archive_update'),"Guardar OCR/metadatos debe pasar por la actualización documental canónica");
must(!archiveApi.includes('financial_app_auto_link_documents'),"El endpoint no debe reintroducir el RPC SECURITY DEFINER de autoenlace retirado en 3.4.4");
must(archiveApi.includes("detail.error||!detail.data"),"PATCH debe validar que puede recuperar el documento actualizado antes de responder éxito");
must(archiveApi.includes('storageProvider==="google_drive"')&&archiveApi.includes("externalOriginalPreserved"),"Los originales de Google Drive deben abrirse directamente y nunca eliminarse desde Financial App");
const driveMigration="database/FINANCIAL_APP_3.3.1_DRIVE_MATCH_DATE.sql";must(fs.existsSync(driveMigration),"Falta la migración canónica de fecha real para documentos Drive");
if(fs.existsSync(driveMigration)){const migration=read(driveMigration);for(const token of ["transaction_match_date","source_original_concept","drive_exact","document_candidates=1","transaction_candidates=1","storage_provider='google_drive'"])must(migration.includes(token),`La vinculación documental ha perdido la garantía: ${token}`);}
const autoLinkBoundaryMigration="database/FINANCIAL_APP_3.4.4_DOCUMENT_AUTOLINK_BOUNDARY.sql";must(fs.existsSync(autoLinkBoundaryMigration),"Falta el cierre canónico del límite de seguridad del autoenlace documental");
if(fs.existsSync(autoLinkBoundaryMigration)){const migration=read(autoLinkBoundaryMigration);for(const token of ["perform financial_app.auto_link_documents_core()","drop function public.financial_app_auto_link_documents() restrict","revoke execute on function financial_app.auto_link_documents_core() from public, anon, authenticated","'app_version',to_jsonb('3.4.4'::text)"])must(migration.includes(token),`El cierre 3.4.4 ha perdido la garantía: ${token}`);}

const homePage=read("app/page.tsx");must(homePage.includes('from "@/components/intent-link"'),"Inicio debe usar la política canónica de navegación por intención");must(!homePage.includes('from "next/link"'),"Inicio no debe recuperar Link con prefetch automático para rutas privadas pesadas");must(homePage.includes("<IntentLink"),"Inicio debe enrutar sus accesos internos mediante IntentLink");
// Vercel procesa la configuración Git de vercel.json antes de ejecutar `vercel build`.
// La fuente original se valida en CI; dentro del build de Vercel esa sección puede no conservarse literalmente.
if(process.env.VERCEL!=="1"){
  const vercel=read("vercel.json");
  for(const pattern of ["audit/**","chore/**","develop/**","feat/**","fix/**","hotfix/**","release/**"])must(vercel.includes(`"${pattern}": false`),`Vercel debe bloquear previews automáticos de ${pattern}`);
}
const sensitivePatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/,/GOOGLE_CLIENT_SECRET\s*=\s*[^$\s]/];for(const file of files){const source=read(file);for(const pattern of sensitivePatterns)must(!pattern.test(source),`Posible secreto incrustado en ${file}`);}

if(failures.length){console.error("Canonical architecture audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Canonical architecture audit OK · ${files.length} archivos runtime inspeccionados · app ${runtimeVersion} · paquete ${packageJson.version} · navegación, Drive/movimientos, OCR resiliente y arquitectura canónica protegidos`);