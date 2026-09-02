import fs from "node:fs";

const drive=fs.readFileSync("lib/document/drive-content-hydration.ts","utf8");
const canonical=fs.readFileSync("lib/document/server-canonical-receipt.ts","utf8");
const archive=fs.readFileSync("lib/document/server-archive-ocr-reprocess.ts","utf8");

const checks=[
  [canonical.includes("recognizeServerReceiptImage"),"canonical server OCR calls Tesseract"],
  [canonical.includes("recognizeTicketImage"),"canonical server OCR calls parser/validator"],
  [drive.includes('financiallyValid=parsed.validation?.status==="complete"'),"Drive requires financial validation before complete"],
  [drive.includes("agreement.compared>=2"),"Drive still requires metadata agreement"],
  [drive.includes("parsed.confidence??0)>=85"),"Drive still requires high OCR confidence"],
  [drive.includes("method:parsed.method"),"Drive persists canonical OCR revision"],
  [drive.includes('sourceMethod:"drive_auto_image_canonical_v2"'),"Drive records ingestion provenance separately"],
  [!drive.includes("drive_auto_image_tesseract_v1"),"Drive v1 shortcut removed"],
  [archive.includes("recognizeCanonicalReceiptBytes"),"Archive server retry uses canonical OCR"],
  [!archive.includes("recognizeServerReceiptImage("),"Archive retry has no parallel Tesseract adapter"],
];

const failed=checks.filter(([ok])=>!ok);
if(failed.length){
  for(const[,label]of failed)console.error(`FAIL: ${label}`);
  process.exit(1);
}
for(const[,label]of checks)console.log(`OK: ${label}`);
console.log("Canonical document OCR regression OK");
