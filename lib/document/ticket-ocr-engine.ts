import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  recognizeTicketImage as recognizeOptimizedTicket,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr-geometry";
import { parseTsvWords } from "./receipt-layout";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentMetadata, DocumentTypeHint, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};
type Bounds={left:number;top:number;width:number;height:number};

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

export async function recognizeTicketImage(
  file: File,
  worker: Worker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  return recognizeOptimizedTicket(file,worker,onProgress,hint);
}
