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
const reconstruction=read("lib/document/receipt-reconstruction.ts");
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
  "paperGeometry",
  "rectify",
  "deskew",
  "canonical_adaptive_psm6",
  "canonical_gray_psm4",
  "reconstructReceiptEvidence",
  "image_ocr_receipt_v501:canonical_v4",
]) must(ocrEngine.includes(token),`OCR canónico 5.0.1 incompleto: ${token}`);
for(const token of ["reconstructReceiptEvidence","mergeAlignedDescriptions","explicitTotals","cleanReceiptMerchant"])
  must(reconstruction.includes(token),`Reconstrucción canónica incompleta: ${token}`);
must(!ocrEngine.includes("locator_money_columns_psm6"),"El OCR canónico no debe conservar la pasada localizadora Tesseract redundante");
must(!ocrEngine.includes("fastcrop_adaptive_psm6"),"El OCR canónico no debe conservar el pipeline fastcrop paralelo");
must(String(pkg.scripts?.["test:ocr"]||"").includes("receipt-reconstruction-v4-tests.ts"),"El caso real de reconstrucción v4 debe ejecutarse en test:ocr");

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
console.log("Financial App 5.0.1 audit OK · OCR canónico único, reconstrucción por evidencia e identidad alineados");
