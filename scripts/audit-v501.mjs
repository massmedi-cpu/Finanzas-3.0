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
const archive=read("app/archivo/archive-client.tsx");
const visual=read("app/archivo/receipt-geometry-preview.tsx");
const loader=read("public/vendor/paddleocr-loader.mjs");
const validator=read("lib/document/receipt-financial-validator.ts");
const revision=read("lib/document/receipt-ocr-revision.ts");
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/ci.yml");

must(/APP_VERSION\s*=\s*["']5\.0\.1["']/.test(version),"APP_VERSION debe ser exactamente 5.0.1");
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
  "engine.predict(file",
  "PP-OCRv6",
  "groupRows",
  "makeVisualLayout",
  "strictReceiptLayout",
  "validateReceiptFinancials",
  "RECEIPT_OCR_METHOD_PREFIX",
  "rawText",
  "normalizedText",
  "passes",
]) must(ocrEngine.includes(token),`OCR canónico 5.0.1 incompleto: ${token}`);

must(archive.includes("PaddleOCR.create")&&archive.includes("imagePreprocessing:false"),"Archivo no utiliza el motor PaddleOCR sin preprocesado heredado");
must(archive.includes('lang:"es"')&&archive.includes('ocrVersion:"PP-OCRv6"'),"Archivo debe usar una combinación de idioma/modelo soportada por PaddleOCR.js para español");
must(!archive.includes('ocrVersion:"PP-OCRv5"'),"PP-OCRv5 no admite lang es en PaddleOCR.js 0.4.2 y no puede volver al runtime");
must(!archive.includes("Tesseract")&&!ocrEngine.includes("Tesseract"),"Tesseract no puede sobrevivir en el runtime OCR");
must(loader.includes("@paddleocr/paddleocr-js@0.4.2"),"Falta PaddleOCR.js 0.4.2 en el loader canónico");
must(visual.includes("ReceiptGeometryPreview")&&visual.includes("position: \"absolute\""),"La reconstrucción ya no conserva la maquetación espacial");

for(const token of [
  "invalid_item_arithmetic",
  "unparsed_body_rows",
  "base_tax_total_mismatch",
  "items_total_mismatch",
  '"needs_review"',
  '"failed"',
]) must(validator.includes(token),`Validador financiero incompleto: ${token}`);

must(revision.includes('paddle_layout_v2'),"La revisión OCR debe identificar paddle_layout_v2");
must(!ocrEngine.includes("prepareReceiptImage"),"El nuevo OCR no debe reutilizar el preprocesador anterior");
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
must(String(pkg.scripts?.prebuild||"").includes("audit-v501.mjs"),"prebuild no ejecuta el gate 5.0.1");
must(String(pkg.scripts?.["audit:current"]||"").includes("audit-v501.mjs"),"audit:current no ejecuta el gate 5.0.1");
must(ci.includes("OCR and identity 5.0.1 audit")&&ci.includes("npm run audit:v501"),"CI no ejecuta el gate 5.0.1");

if(failures.length){
  console.error("Financial App 5.0.1 audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Financial App 5.0.1 audit OK · PP-OCRv6 español soportado, geometría preservada, sin fallback Tesseract y validación financiera estricta");
