import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  recognizeTicketImage as recognizeRectifiedTicket,
  scoreReceiptCandidate,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr-v307";
import {
  parseReceiptTsvLayout,
  parseTsvWords,
  receiptLayoutToText,
  receiptLayoutTotal,
  type ReceiptLayout,
} from "./receipt-layout";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentMetadata, DocumentTypeHint, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};
type SupplementalPass = {text:string;layoutText:string;confidence:number|null;tsv:string};
type Bounds={left:number;top:number;width:number;height:number};
type GeometryPass=SupplementalPass&{receiptLayout:ReceiptLayout|null;bounds:Bounds;canvas:HTMLCanvasElement};

const visibleLength = (value: string) => value.replace(/\s/g, "").length;
const letterCount=(value:string)=>(value.match(/\p{L}/gu)||[]).length;
const wordCount=(value:string)=>(value.match(/[\p{L}]{2,}/gu)||[]).length;
const compactWords = (value: string) => value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function repairReceiptNumbers(line: string) {
  if (/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/.test(line)) return line;
  return line
    .replace(/\b(\d)(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/\b(\d{1,2})\s+(\d{2})(?=\s+\d+[.,]\d{2}\b)/g, "$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi, "$1$2,$3");
}

function numericSignature(line: string) {
  const repaired = repairReceiptNumbers(line);
  const values = repaired.match(/\d+(?:[.,:]\d{2})/g) || [];
  if (!values.length) return "";
  return values.slice(-2).map((value) => value.replace(",", ".")).join("|");
}

function lexicalOverlap(a: string, b: string) {
  const left = new Set(compactWords(a).filter((word) => /[A-Z]/.test(word)));
  const right = new Set(compactWords(b).filter((word) => /[A-Z]/.test(word)));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const word of left) if (right.has(word)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function lineQuality(raw: string) {
  const line = repairReceiptNumbers(raw).trim();
  const letters = letterCount(line);
  const words = wordCount(line);
  const decimals = (line.match(/\d+[.,]\d{2}\b/g) || []).length;
  const singleNoise = (line.match(/(?:^|\s)[A-Z](?=\s|$)/g) || []).length;
  const collapsedPrice = (line.match(/\b\d{3,4}(?=\s+\d+[.,]\d{2}\b)/g) || []).length;
  let score = letters * 0.22 + words * 1.15 + decimals * 2.7;
  score -= singleNoise * 2.1 + collapsedPrice * 3.2;
  if (/\b(TOTAL|IVA|BASE|HORA|FECHA|MESA|CAMARERO|PRECIO|IMPORTE)\b/i.test(line)) score += 3;
  if (line.length > 4 && line.length < 80) score += 1;
  return score;
}

export function mergeReceiptTexts(primaryText: string, alternateText: string) {
  const primary = normalizeOcrText(primaryText).split(/\r?\n/).filter(Boolean);
  const alternate = normalizeOcrText(alternateText).split(/\r?\n/).filter(Boolean);
  if (!primary.length) return normalizeOcrText(alternateText);
  if (!alternate.length) return normalizeOcrText(primaryText);
  const used = new Set<number>();
  const merged = primary.map((source, sourceIndex) => {
    const signature = numericSignature(source);
    let bestIndex = -1;
    let bestFit = -Infinity;
    for (let index = 0; index < alternate.length; index += 1) {
      if (used.has(index)) continue;
      const candidate = alternate[index];
      const candidateSignature = numericSignature(candidate);
      const distance = Math.abs(index - sourceIndex);
      let fit = -distance * 0.35;
      if (signature && candidateSignature === signature) fit += 8;
      else if (signature || candidateSignature) fit -= 3;
      fit += lexicalOverlap(source, candidate) * 5;
      if (fit > bestFit) {bestFit = fit;bestIndex = index;}
    }
    if (bestIndex < 0 || bestFit < 1.5) return repairReceiptNumbers(source);
    const candidate = alternate[bestIndex];
    const candidateSignature=numericSignature(candidate);
    const sourceQuality = lineQuality(source);
    const candidateQuality = lineQuality(candidate);
    const samePrices=Boolean(signature)&&candidateSignature===signature;
    const richerMatchingLine=samePrices&&candidateQuality>=sourceQuality-0.25&&(letterCount(candidate)>=letterCount(source)+1||wordCount(candidate)>=wordCount(source)+1);
    if (candidateQuality > sourceQuality + 0.9 || richerMatchingLine) {used.add(bestIndex);return repairReceiptNumbers(candidate);}
    return repairReceiptNumbers(source);
  });
  return normalizeOcrText(merged.join("\n"));
}

function textQuality(text: string) {
  return normalizeOcrText(text).split(/\r?\n/).filter(Boolean).reduce((sum, line) => sum + lineQuality(line), 0);
}

async function makeSupplementalCanvas(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const maxWidth = 3400;
    const maxHeight = 6200;
    const scale = Math.min(1.35, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    context.fillStyle = "#fff";context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.55)";context.drawImage(bitmap, 0, 0, width, height);context.filter = "none";
    return canvas;
  } finally {bitmap.close();}
}

function quantile(values:number[],q:number){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const index=Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*q)));return sorted[index];}

export function detectReceiptTextBounds(tsv:string,width:number,height:number):Bounds{
  const words=parseTsvWords(tsv).filter(word=>word.conf>=20&&word.height<height*.09&&word.width>=word.height*.48);
  if(words.length<12)return{left:0,top:0,width,height};
  const lefts=words.map(word=>word.left);const rights=words.map(word=>word.left+word.width);const tops=words.map(word=>word.top);const bottoms=words.map(word=>word.top+word.height);
  let left=quantile(lefts,.04);let right=quantile(rights,.96);let top=quantile(tops,.015);let bottom=quantile(bottoms,.985);
  const contentWidth=right-left;const contentHeight=bottom-top;
  if(contentWidth<width*.28||contentHeight<height*.34)return{left:0,top:0,width,height};
  left=clamp(left-contentWidth*.09,0,width-1);right=clamp(right+contentWidth*.09,left+1,width);top=clamp(top-contentHeight*.045,0,height-1);bottom=clamp(bottom+contentHeight*.055,top+1,height);
  return{left:Math.floor(left),top:Math.floor(top),width:Math.ceil(right-left),height:Math.ceil(bottom-top)};
}

function cropCanvas(source:HTMLCanvasElement,bounds:Bounds){
  const output=document.createElement("canvas");output.width=Math.max(1,Math.round(bounds.width));output.height=Math.max(1,Math.round(bounds.height));
  const context=output.getContext("2d");if(!context)throw new Error("Canvas no disponible");context.fillStyle="#fff";context.fillRect(0,0,output.width,output.height);context.drawImage(source,bounds.left,bounds.top,bounds.width,bounds.height,0,0,output.width,output.height);return output;
}

async function recognizePass(worker:Worker,input:HTMLCanvasElement,psm:string):Promise<SupplementalPass>{
  await worker.setParameters?.({tessedit_pageseg_mode:psm,preserve_interword_spaces:"1",user_defined_dpi:"300"});
  const result=await worker.recognize(input,{}, {text:true,tsv:true});const raw=String(result.data?.text||"");
  return{text:normalizeOcrText(raw),layoutText:preserveOcrLayout(raw),confidence:Number.isFinite(result.data?.confidence)?Number(result.data?.confidence):null,tsv:String(result.data?.tsv||"")};
}

async function geometryReceiptPass(file:File,worker:Worker):Promise<GeometryPass>{
  const full=await makeSupplementalCanvas(file);
  const locator=await recognizePass(worker,full,"11");
  const bounds=detectReceiptTextBounds(locator.tsv,full.width,full.height);
  const cropped=cropCanvas(full,bounds);
  let structured=await recognizePass(worker,cropped,"6");
  let receiptLayout=parseReceiptTsvLayout(structured.tsv);
  if(!receiptLayout||receiptLayout.items.length<2){const alternate=await recognizePass(worker,cropped,"4");const alternateLayout=parseReceiptTsvLayout(alternate.tsv);if((alternateLayout?.items.length||0)>(receiptLayout?.items.length||0)){structured=alternate;receiptLayout=alternateLayout;}}
  return{...structured,receiptLayout,bounds,canvas:cropped};
}

function extractTotalsZoneAmount(text:string){
  const lines=normalizeOcrText(text).split(/\r?\n/).filter(Boolean);
  for(const line of lines){if(!/^\s*total\b/i.test(line))continue;const values=line.match(/\d{1,6}[.,]\d{2}\b/g)||[];if(values.length){const value=parseEuroValue(values.at(-1)!);if(value!==null)return value;}}
  const values=lines.flatMap(line=>line.match(/\d{1,6}[.,]\d{2}\b/g)||[]).map(parseEuroValue).filter((value):value is number=>value!==null&&value>=0&&value<100000);
  return values.length?Math.max(...values):null;
}

async function totalsZonePass(worker:Worker,cropped:HTMLCanvasElement){
  const top=Math.floor(cropped.height*.48);const height=Math.max(1,Math.floor(cropped.height*.37));const zone=cropCanvas(cropped,{left:0,top,width:cropped.width,height});
  const pass=await recognizePass(worker,zone,"6");return{...pass,amount:extractTotalsZoneAmount(pass.text)};
}

function enrichMetadata(text:string,hint:DocumentTypeHint,layout:ReceiptLayout|null,totalZoneAmount:number|null,alternates:DocumentMetadata[]):DocumentMetadata{
  const own=inferDocumentMetadata(text,hint);const amount=receiptLayoutTotal(layout)??totalZoneAmount??own.amount??alternates.map(meta=>meta.amount).find((value):value is number=>value!==null)??null;
  const documentDate=own.documentDate??alternates.map(meta=>meta.documentDate).find((value):value is string=>Boolean(value))??null;
  const merchant=own.merchant??alternates.map(meta=>meta.merchant).find((value):value is string=>Boolean(value))??null;
  return{...own,amount,documentDate,merchant};
}

export async function recognizeTicketImage(
  file: File,
  worker: Worker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const base = await recognizeRectifiedTicket(file,worker,(value,label)=>onProgress(Math.min(0.63,value*0.63),label),hint);
  try{
    onProgress(0.67,"Localizando el ticket real dentro de la foto");
    const geometry=await geometryReceiptPass(file,worker);
    onProgress(0.82,"Reconstruyendo columnas por posición");
    const geometryText=geometry.receiptLayout?receiptLayoutToText(geometry.receiptLayout):geometry.text;
    const mergedText=mergeReceiptTexts(base.text,geometryText);
    const baseMetadata=inferDocumentMetadata(base.text,hint);const geometryMetadata=inferDocumentMetadata(geometryText,hint);const mergedMetadata=inferDocumentMetadata(mergedText,hint);
    let totalZoneAmount=receiptLayoutTotal(geometry.receiptLayout);
    let totalPass:Awaited<ReturnType<typeof totalsZonePass>>|null=null;
    if(totalZoneAmount===null){onProgress(0.88,"Leyendo el bloque de Base, IVA y Total");totalPass=await totalsZonePass(worker,geometry.canvas);totalZoneAmount=totalPass.amount;}
    const useGeometry=Boolean(geometry.receiptLayout&&geometry.receiptLayout.items.length>=2);
    const finalText=useGeometry?geometryText:(textQuality(mergedText)>=textQuality(base.text)-.5?mergedText:base.text);
    const finalLayout=useGeometry?geometry.layoutText:(finalText===mergedText?mergeReceiptTexts(base.layoutText||base.text,geometry.layoutText||geometry.text):base.layoutText);
    const metadata=enrichMetadata(finalText,hint,geometry.receiptLayout,totalZoneAmount,[geometryMetadata,mergedMetadata,baseMetadata]);
    const geometryScore=scoreReceiptCandidate(geometryText,geometry.confidence,hint);const mergedScore=scoreReceiptCandidate(mergedText,geometry.confidence,hint);
    onProgress(0.98,"Validando fecha, comercio y total");
    return{text:finalText,layoutText:finalLayout,confidence:geometry.confidence??base.confidence,method:useGeometry?"image_ocr_receipt_v309:geometry_tsv":"image_ocr_receipt_v309:consensus_fallback",receiptLayout:geometry.receiptLayout,metadata,passes:[...base.passes,{variant:"receipt_locator_psm11",confidence:geometry.confidence,score:Math.round(geometryScore*10)/10},{variant:"geometry_table_psm6",confidence:geometry.confidence,score:Math.round(geometryScore*10)/10},{variant:"geometry_consensus",confidence:geometry.confidence,score:Math.round(mergedScore*10)/10},...(totalPass?[{variant:"totals_zone_psm6",confidence:totalPass.confidence,score:totalZoneAmount??0}]:[])]};
  }catch{
    onProgress(0.98,"Validando el resultado final");
    const metadata=inferDocumentMetadata(base.text,hint);
    return{...base,method:"image_ocr_receipt_v309:rectified_fallback",metadata};
  }
}
