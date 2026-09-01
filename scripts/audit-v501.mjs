import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const version=read("lib/app-version.ts");
const migration=read("database/FINANCIAL_APP_5.0.1_OCR_BRAND_RELEASE.sql");
const release=read("docs/releases/5.0.1.md");
const login=read("app/login/page.tsx");
const authCss=read("app/auth.css");
const ocrEngine=read("lib/document/ticket-ocr-engine.ts");
const preprocessor=read("lib/document/receipt-image-preprocessor.ts");
const archive=read("app/archivo/archive-client.tsx");
const visual=read("app/archivo/receipt-geometry-preview.tsx");
const loader=read("public/vendor/paddleocr-loader.mjs");
const serverOcrRoute=read("app/api/ocr/receipt/route.ts");
const serverOcrCore=fs.existsSync("lib/document/server-receipt-ocr.ts")?read("lib/document/server-receipt-ocr.ts"):serverOcrRoute;
const nextConfig=read("next.config.ts");
const validator=read("lib/document/receipt-financial-validator.ts");
const revision=read("lib/document/receipt-ocr-revision.ts");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/ci.yml");

const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"";
const semver=value=>String(value).split(".").map(part=>Number.parseInt(part,10)||0);
const atLeast=(value,minimum)=>{const a=semver(value),b=semver(minimum);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)}return true};
must(atLeast(currentVersion,"5.0.1"),"APP_VERSION debe conservar como mínimo el baseline 5.0.1");
for(const token of [
  "financial_app_5_0_1_requires_5_0_baseline",
  "'app_version',to_jsonb('5.0.1'::text)",
  "'target_version',to_jsonb('5.0.1'::text)",
  "financial_app_release_manifest",
  "financial_app_5_0_1_manifest_alignment_failed",
]) must(migration.includes(token),`Migración 5.0.1 incompleta: ${token}`);
must(!/(?:insert\s+into|update|delete\s+from)\s+financial_app\.transactions/i.test(migration),"5.0.1 no puede mutar movimientos");
must(release.includes("Financial App 5.0.1")&&release.includes("Nuevo logotipo"),"Falta documentar OCR e identidad de 5.0.1");
must(login.includes('src="/brand/logotipo.png"')&&login.includes("width={260}")&&login.includes("height={260}"),"Login no utiliza el nuevo logotipo con tamaño legible");
must(authCss.includes("background:transparent")&&authCss.includes("max-width:260px"),"El contenedor de marca debe respetar la transparencia del nuevo logotipo");

for(const token of [
  "engine.predict(input",
  "PP-OCRv6",
  "groupRows",
  "makeVisualLayout",
  "strictReceiptLayout",
  "filterReceiptBoxes",
  "validateReceiptFinancials",
  "RECEIPT_OCR_METHOD_PREFIX",
  "rawText",
  "normalizedText",
  "literalText",
  "trustedText",
  "passes",
]) must(ocrEngine.includes(token),`OCR canónico 5.0.1 incompleto: ${token}`);

must(archive.includes("PaddleOCR.create")&&archive.includes("sharedWorkerPromise")&&archive.includes("workerReuse:true"),"Archivo no conserva el adaptador OCR geométrico reutilizable");
must(archive.includes('lang:"es"')&&archive.includes('ocrVersion:"PP-OCRv6"'),"Archivo ha perdido el contrato de idioma/modelo que alimenta el motor geométrico");
must(!archive.includes('ocrVersion:"PP-OCRv5"'),"PP-OCRv5 no admite lang es en el contrato OCR histórico y no puede volver al runtime");
must(!archive.includes("Tesseract")&&!ocrEngine.includes("Tesseract"),"El cliente y el motor geométrico no deben acoplarse directamente a Tesseract");
must(loader.includes('SERVER_OCR_ENDPOINT = "/api/ocr/receipt"')&&loader.includes("serverPredict"),"El adaptador OCR móvil no apunta al reconocimiento autenticado del servidor");
must(/createWorker\(\s*["']spa["']/.test(serverOcrCore)&&serverOcrCore.includes('runtime:"server-tesseract-7"')||/createWorker\(\s*["']spa["']/.test(serverOcrCore)&&serverOcrCore.includes('runtime: "server-tesseract-7"'),"El reconocimiento OCR real del servidor no está fijado a Tesseract español");
if(fs.existsSync("lib/document/server-receipt-ocr.ts")){
  must(serverOcrRoute.includes('from "@/lib/document/server-receipt-ocr"')&&serverOcrRoute.includes("recognizeServerReceiptImage"),"La ruta OCR debe consumir el núcleo español de servidor compartido");
  must(!serverOcrRoute.includes("createWorker"),"La ruta OCR no debe duplicar el worker Tesseract español");
}
must(nextConfig.includes("./node_modules/regenerator-runtime/**/*")&&nextConfig.includes("./node_modules/tesseract.js/**/*")&&nextConfig.includes("'/api/ocr/receipt': ocrRuntimeAssets"),"El bundle OCR del servidor no protege las dependencias críticas de Tesseract");
must(visual.includes("ReceiptGeometryPreview")&&visual.includes("viewBox")&&visual.includes("textLength")&&visual.includes('lengthAdjust="spacingAndGlyphs"'),"La reconstrucción ya no conserva la maquetación espacial");

for(const token of [
  "invalid_item_arithmetic",
  "unparsed_body_rows",
  "base_tax_total_mismatch",
  "items_total_mismatch",
  '"needs_review"',
  '"failed"',
]) must(validator.includes(token),`Validador financiero incompleto: ${token}`);

const ocrRevisionNumber=Number.parseInt(revision.match(/paddle_layout_v(\d+)/)?.[1]||"0",10);
must(ocrRevisionNumber>=4,"La revisión OCR debe conservar como mínimo el baseline paddle_layout_v4");
must(ocrEngine.includes("prepareReceiptImage")&&ocrEngine.includes("if (prepared.paperDetected)")&&ocrEngine.includes("input = prepared.grayscale"),"El OCR debe aislar el papel únicamente cuando la detección sea segura");
must(ocrEngine.includes("input = file")&&!ocrEngine.includes("input = prepared.adaptive"),"El aislamiento de papel debe tener fallback al original y no usar binarización destructiva");
must((ocrEngine.match(/engine\.predict\(/g)||[]).length===1,"El OCR canónico debe ejecutar una única inferencia de reconocimiento");
must(preprocessor.includes("detectPaper")&&preprocessor.includes("rectifyPaper")&&preprocessor.includes("perspectiveCorrected"),"El aislamiento de papel no conserva sus garantías geométricas");
must(!ocrEngine.includes("shouldRunSecondary"),"El nuevo OCR no debe ejecutar una segunda pasada de rescate");
must(!ocrEngine.includes("reconstructReceiptEvidence"),"El nuevo OCR no debe fusionar lecturas de distintos pases");
must(!/\b(?:ENERGY|CUBATA|GALICIA|CAÑA|AGUA CON GAS|AVILA BAR)\b/i.test(ocrEngine),"El OCR no puede contener vocabulario específico de un ticket");

function pngDimensions(file){
  const value=fs.readFileSync(file);
  const signature="89504e470d0a1a0a";
  must(value.subarray(0,8).toString("hex")===signature,`${file} no es un PNG válido`);
  return[value.readUInt32BE(16),value.readUInt32BE(20)];
}
for(const [file,width,height] of [
  ["public/brand/logotipo.png",640,640],
  ["public/brand/isotipo.png",256,256],
  ["app/icon.png",512,512],
  ["app/apple-icon.png",180,180],
  ["public/icons/icon-192.png",192,192],
  ["public/icons/icon-512.png",512,512],
]){
  const [actualWidth,actualHeight]=pngDimensions(file);
  must(actualWidth===width&&actualHeight===height,`${file} debe medir ${width}x${height}, no ${actualWidth}x${actualHeight}`);
}

must(pkg.scripts?.["audit:v501"]==="node scripts/audit-v501.mjs","Falta script audit:v501");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v501.mjs"),"audit:current no protege el gate 5.0.1");
must(String(pkg.scripts?.["audit:release"]||"").includes("audit:current"),"audit:release debe delegar en la auditoría canónica actual");
must(String(pkg.scripts?.prebuild||"").includes("audit:release"),"prebuild debe ejecutar el gate consolidado de release");
must(ci.includes("npm run build"),"CI debe ejecutar el build, que aplica el prebuild consolidado");

if(failures.length){
  console.error("Financial App 5.0.1 baseline audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Financial App 5.0.1 baseline audit OK · reconocimiento Tesseract español en servidor · papel aislado con fallback seguro · geometría preservada · una sola inferencia · validación financiera estricta");
