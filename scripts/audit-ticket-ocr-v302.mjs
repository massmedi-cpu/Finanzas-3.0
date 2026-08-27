import fs from "node:fs";

const read=(file)=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const client=read("app/archivo/archive-client.tsx");
const engine=read("lib/document/ticket-ocr-engine.ts");
const preprocessor=read("lib/document/receipt-image-preprocessor.ts");
const reconstruction=read("lib/document/receipt-reconstruction.ts");
const validator=read("lib/document/receipt-financial-validator.ts");
const revision=read("lib/document/receipt-ocr-revision.ts");
const receiptLayout=read("lib/document/receipt-layout.ts");
const baseOcr=read("lib/document/ticket-ocr.ts");
const archiveApi=read("app/api/archive/[id]/route.ts");
const tsconfig=read("tsconfig.json");
const pkg=JSON.parse(read("package.json"));
const version=read("lib/app-version.ts");

must(client.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"Archivo no usa el motor OCR canónico");
must(client.includes("RECEIPT_OCR_METHOD_PREFIX")&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr"),"Falta migración automática de revisiones OCR anteriores desde el original");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El worker Tesseract debe reutilizarse");
for(const token of ["rawText:recognized.rawText","normalizedText:recognized.normalizedText","tsv:recognized.tsv","validation:recognized.validation","metrics:recognized.metrics","localProcessing:true","automaticOnImport:true"])
  must(client.includes(token),`Archivo no persiste la evidencia OCR: ${token}`);

for(const token of ["prepareReceiptImage","adaptive_psm6","grayscale_psm4","reconstructReceiptEvidence","validateReceiptFinancials","RECEIPT_OCR_METHOD_PREFIX","rawText","normalizedText","tsv","metrics"])
  must(engine.includes(token),`Motor OCR canónico incompleto: ${token}`);
must(!/recognizeLegacyTicket|geometryReceiptPass|totalsZonePass|fastcrop_adaptive_psm6|fastcrop_gray_psm6|locator_money_columns_psm6/.test(engine),"Sobrevive un fallback o pipeline OCR paralelo");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe existir un segundo motor OCR runtime versionado");
must(!fs.existsSync("lib/document/ticket-ocr-geometry.ts"),"El motor geométrico legado debe estar eliminado, no dormido en runtime");

for(const token of ["detectPaper","rectifyPaper","estimateDeskewFromSamples","deskew","localAdaptiveThreshold","contrastStretch"])
  must(preprocessor.includes(token),`Preprocesado físico incompleto: ${token}`);
for(const token of ["samePhysicalRow","mergePhysicalRows","arithmeticValid","reconstructReceiptEvidence"])
  must(reconstruction.includes(token),`Reconstrucción física incompleta: ${token}`);
must(reconstruction.includes("Never shift descriptions by price similarity or lexical resemblance"),"La reconstrucción debe prohibir reasignar descripciones por precio o similitud léxica");
must(receiptLayout.includes("parseReceiptTsvLayout")&&receiptLayout.includes("unparsedBody")&&receiptLayout.includes("top")&&receiptLayout.includes("bottom"),"El layout debe preservar TSV, geometría y filas no interpretadas");

for(const token of ["needs_review","failed","invalid_item_arithmetic","unparsed_body_rows","items_total_mismatch","base_tax_total_mismatch"])
  must(validator.includes(token),`Validador financiero incompleto: ${token}`);
must(revision.includes('canonical_integrity_v5')&&revision.includes('image_ocr_receipt_v501:'),"La revisión OCR canónica no está identificada de forma estable");

for(const token of ["rawText","normalizedText","layoutText","tsv","validation","metrics"])
  must(baseOcr.includes(token),`El contrato OCR ha perdido ${token}`);
must(/documentType\s*!==\s*["']receipt["']/.test(baseOcr),"Los tickets no deben inferir importe desde cualquier decimal cuando falta total");
must(/tomorrow/.test(baseOcr)&&/documentType\s*===\s*["']receipt["']/.test(baseOcr),"Las fechas futuras imposibles de tickets deben rechazarse");
must(/raz\[oó\]n\\s\+social/.test(baseOcr)&&/tel\[eé\]fono/.test(baseOcr),"Metadatos fiscales y teléfono no deben convertirse en nombre comercial");

must(archiveApi.includes("validateReceiptFinancials")&&archiveApi.includes('method.startsWith("image_ocr_receipt_")')&&archiveApi.includes("validation.status"),"La API no revalida el OCR antes de persistir estado complete");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"El alias OCR no apunta al único motor canónico");
must(String(pkg.scripts?.["test:ocr"]||"").includes("ticket-ocr-v302-tests.ts")&&String(pkg.scripts?.["test:ocr"]||"").includes("receipt-reconstruction-v4-tests.ts"),"CI no ejecuta las regresiones OCR");

const runtime=[engine,preprocessor,reconstruction,validator,receiptLayout].join("\n");
for(const forbidden of ["ENERGY","CUBATA","TERCIO GALICIA","CAÑA GRANDE","CANA GRANDE","AGUA CON GAS","ÁVILA BAR","AVILA BAR"])
  must(!runtime.toUpperCase().includes(forbidden.toUpperCase()),`Runtime OCR contiene vocabulario específico prohibido: ${forbidden}`);

const versionMatch=version.match(/APP_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica");

if(failures.length){
  console.error("Ticket OCR integrity audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Ticket OCR integrity audit OK · motor único · RAW/TSV · geometría física · validación financiera · ${versionMatch?.[0]||"APP_VERSION"}`);
