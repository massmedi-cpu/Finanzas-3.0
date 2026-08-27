import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  type DocumentTypeHint,
  type DocumentMetadata,
  type ImageOcrResult,
} from "./ticket-ocr";
import {
  parseReceiptLayout,
  parseReceiptTsvLayout,
  receiptLayoutToText,
  receiptLayoutTotal,
  tsvLines,
  type ReceiptLayout,
  type ReceiptLineItem,
  type ReceiptSummaryLine,
} from "./receipt-layout";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentTypeHint, DocumentMetadata, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (
    input: File | HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<Recognition>;
};
type Word = { text: string; conf: number; left: number; top: number; width: number; key: string };
type PaperGeometry = {
  top: number;
  bottom: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
};
type Candidate = {
  variant: string;
  text: string;
  layoutText: string;
  confidence: number | null;
  score: number;
  tsv: string;
  receiptLayout: ReceiptLayout | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const repair = (value: string) =>
  value
    .replace(/(\d)\s*[:;]\s*(\d{2})(?=\b)/g, "$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi, "$1$2,$3")
    .trimEnd();
const visibleChars = (value: string) => value.replace(/\s/g, "").length;

export function reconstructTsvReceipt(tsv: string) {
  if (!tsv.trim()) return null;
  const words: Word[] = [];
  for (const row of tsv.replace(/\r/g, "").split("\n").slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || Number(columns[0]) !== 5) continue;
    const text = columns.slice(11).join("\t").trim();
    const conf = Number(columns[10]);
    if (!text || !Number.isFinite(conf) || conf < 28) continue;
    const visible = text.replace(/\s/g, "");
    const useful = (visible.match(/[\p{L}\d€%.,:()/-]/gu) || []).length;
    if (visible.length && useful / visible.length < 0.55) continue;
    words.push({
      text,
      conf,
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      key: `${columns[2]}:${columns[3]}:${columns[4]}`,
    });
  }

  const groups = new Map<string, Word[]>();
  for (const word of words) {
    const group = groups.get(word.key) || [];
    group.push(word);
    groups.set(word.key, group);
  }

  const lines = [...groups.values()]
    .map((group) => {
      group.sort((a, b) => a.left - b.left);
      const mean = group.reduce((sum, word) => sum + word.conf, 0) / group.length;
      const plain = repair(group.map((word) => word.text).join(" "));
      const strong =
        /\b(total|iva|base|fecha|hora|mesa|precio|importe|pendiente)\b/i.test(plain) ||
        /\d+[.,:]\d{2}/.test(plain);
      if (mean < 38 && !strong) return null;
      const widths = group
        .map((word) => word.width / Math.max(1, word.text.length))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const charWidth = Math.max(5, widths[Math.floor(widths.length / 2)] || 9);
      const left = group[0].left;
      let layout = "";
      for (const word of group) {
        const column = Math.max(0, Math.round((word.left - left) / charWidth));
        if (layout.length < column) layout += " ".repeat(column - layout.length);
        else if (layout && !layout.endsWith(" ")) layout += " ";
        layout += word.text;
      }
      return { top: Math.min(...group.map((word) => word.top)), plain, layout: repair(layout) };
    })
    .filter((line): line is { top: number; plain: string; layout: string } => Boolean(line))
    .sort((a, b) => a.top - b.top);

  return lines.length
    ? { text: lines.map((line) => line.plain).join("\n"), layoutText: lines.map((line) => line.layout).join("\n") }
    : null;
}

export function estimateDeskewFromSamples(samples: Array<{ x: number; y: number }>, width: number, height: number) {
  if (samples.length < 80) return 0;
  let bestAngle = 0;
  let bestScore = -Infinity;
  const step = Math.max(2, Math.round(height / 420));
  for (let angle = -7; angle <= 7; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const bins = new Uint32Array(Math.ceil((height + Math.abs(width * sine)) / step) + 8);
    for (const point of samples) {
      const projected = point.y * cosine - point.x * sine + Math.abs(width * sine) + step * 2;
      const index = Math.floor(projected / step);
      if (index >= 0 && index < bins.length) bins[index] += 1;
    }
    let score = 0;
    for (let index = 1; index < bins.length - 1; index += 1) {
      const value = bins[index] * 2 + bins[index - 1] + bins[index + 1];
      score += value * value;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return Math.abs(bestAngle) < 0.45 ? 0 : Math.round(bestAngle * 2) / 2;
}

function paperGeometry(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = Math.max(4, Math.floor(Math.max(width, height) / 650));
  const rows = Math.ceil(height / step);
  const columns = Math.ceil(width / step);
  const minHits = Math.max(4, Math.round(columns * 0.16));
  const spans: Array<{ y: number; left: number; right: number }> = [];
  for (let gridY = 0; gridY < rows; gridY += 1) {
    const y = Math.min(height - 1, gridY * step);
    let hits = 0;
    let left = width;
    let right = 0;
    for (let gridX = 0; gridX < columns; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const red = data.data[offset];
      const green = data.data[offset + 1];
      const blue = data.data[offset + 2];
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (luminance >= 142 && high - low <= 72 && green >= red - 38 && blue >= red - 38) {
        hits += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (hits >= minHits && right > left) spans.push({ y, left, right });
  }
  if (spans.length < rows * 0.22) return null;
  const top = spans[0].y;
  const bottom = spans.at(-1)!.y;
  if (bottom - top < height * 0.42) return null;
  const band = Math.max(4, Math.round(spans.length * 0.16));
  const topBand = spans.slice(0, band);
  const bottomBand = spans.slice(-band);
  const topLeft = median(topBand.map((span) => span.left));
  const topRight = median(topBand.map((span) => span.right));
  const bottomLeft = median(bottomBand.map((span) => span.left));
  const bottomRight = median(bottomBand.map((span) => span.right));
  const topWidth = topRight - topLeft;
  const bottomWidth = bottomRight - bottomLeft;
  if (Math.min(topWidth, bottomWidth) < width * 0.34) return null;
  const widthRatio=Math.max(topWidth,bottomWidth)/Math.max(1,Math.min(topWidth,bottomWidth));
  const nearImageEdge=spans.filter(span=>span.left<=step*2||span.right>=width-step*2).length/spans.length;
  if(widthRatio>1.28||nearImageEdge>.45&&Math.max(topWidth,bottomWidth)>width*.78)return null;
  return { top, bottom, topLeft, topRight, bottomLeft, bottomRight };
}

function rectify(base: HTMLCanvasElement, geometry: PaperGeometry | null) {
  if (!geometry) {
    const copy = document.createElement("canvas");
    copy.width = base.width;
    copy.height = base.height;
    copy.getContext("2d")?.drawImage(base, 0, 0);
    return { canvas: copy, perspective: false };
  }
  const height = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.06);
  const marginY = Math.round(height * 0.06);
  const output = document.createElement("canvas");
  output.width = targetWidth + marginX * 2;
  output.height = height + marginY * 2;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  const strip = Math.max(1, Math.round(height / 900));
  for (let destinationY = 0; destinationY < height; destinationY += strip) {
    const ratio = destinationY / Math.max(1, height - 1);
    const left = geometry.topLeft + (geometry.bottomLeft - geometry.topLeft) * ratio;
    const right = geometry.topRight + (geometry.bottomRight - geometry.topRight) * ratio;
    const sourceY = geometry.top + destinationY;
    const sourceHeight = Math.min(strip, height - destinationY);
    context.drawImage(
      base,
      left,
      sourceY,
      Math.max(1, right - left),
      sourceHeight,
      marginX,
      marginY + destinationY,
      targetWidth,
      sourceHeight,
    );
  }
  return {
    canvas: output,
    perspective:
      Math.abs(topWidth - bottomWidth) > Math.max(12, targetWidth * 0.025) ||
      Math.abs(geometry.topLeft - geometry.bottomLeft) > Math.max(12, targetWidth * 0.025),
  };
}

function deskew(source: HTMLCanvasElement) {
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { canvas: source, angle: 0 };
  sampleContext.drawImage(source, 0, 0, width, height);
  const data = sampleContext.getImageData(0, 0, width, height);
  const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const luminance = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
      if (luminance < 155) points.push({ x, y });
    }
  }
  if (points.length > 18000) {
    const every = Math.ceil(points.length / 18000);
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (index % every !== 0) points.splice(index, 1);
    }
  }
  const angle = estimateDeskewFromSamples(points, width, height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const output = document.createElement("canvas");
  output.width = Math.ceil(source.width * cosine + source.height * sine);
  output.height = Math.ceil(source.height * cosine + source.width * sine);
  const context = output.getContext("2d");
  if (!context) return { canvas: source, angle: 0 };
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

export function localAdaptiveThreshold(grayscale:Uint8ClampedArray,width:number,height:number){
  const output=new Uint8ClampedArray(grayscale.length);const stride=width+1;const integral=new Uint32Array(stride*(height+1));
  for(let y=1;y<=height;y+=1){let row=0;for(let x=1;x<=width;x+=1){row+=grayscale[((y-1)*width+(x-1))*4];integral[y*stride+x]=integral[(y-1)*stride+x]+row;}}
  const radius=clamp(Math.round(Math.min(width,height)/38),18,42);const ratio=.92;
  for(let y=0;y<height;y+=1){const top=Math.max(0,y-radius);const bottom=Math.min(height,y+radius+1);for(let x=0;x<width;x+=1){const left=Math.max(0,x-radius);const right=Math.min(width,x+radius+1);const area=(right-left)*(bottom-top);const sum=integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left];const source=(y*width+x)*4;const value=grayscale[source]<sum/Math.max(1,area)*ratio?0:255;output[source]=output[source+1]=output[source+2]=value;output[source+3]=255;}}
  return output;
}

async function variants(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = bitmap.width < 1250 ? Math.min(1.2, 1400 / Math.max(1, bitmap.width)) : 1;
    if (bitmap.width * scale > 2000) scale = 2000 / bitmap.width;
    if (bitmap.height * scale > 3400) scale = Math.min(scale, 3400 / bitmap.height);
    const fullWidth = Math.round(bitmap.width * scale);
    const fullHeight = Math.round(bitmap.height * scale);
    const base = document.createElement("canvas");
    base.width = fullWidth;
    base.height = fullHeight;
    const baseContext = base.getContext("2d", { willReadFrequently: true });
    if (!baseContext) throw new Error("Canvas no disponible");
    baseContext.fillStyle = "#fff";
    baseContext.fillRect(0, 0, fullWidth, fullHeight);
    baseContext.drawImage(bitmap, 0, 0, fullWidth, fullHeight);
    const geometry = paperGeometry(baseContext.getImageData(0, 0, fullWidth, fullHeight), fullWidth, fullHeight);
    const rectified = rectify(base, geometry);
    const straight = deskew(rectified.canvas);
    const natural = straight.canvas;
    const width = natural.width;
    const height = natural.height;
    const context = natural.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    const data = context.getImageData(0, 0, width, height);
    const grayscale = new Uint8ClampedArray(data.data.length);
    for (let offset = 0; offset < data.data.length; offset += 4) {
      const value = Math.round(data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722);
      grayscale[offset] = grayscale[offset + 1] = grayscale[offset + 2] = value;
      grayscale[offset + 3] = 255;
    }
    const adaptive = localAdaptiveThreshold(grayscale,width,height);
    const adaptiveCanvas = document.createElement("canvas");
    adaptiveCanvas.width = width;
    adaptiveCanvas.height = height;
    adaptiveCanvas.getContext("2d")?.putImageData(new ImageData(adaptive, width, height), 0, 0);
    return {
      adaptive: adaptiveCanvas,
      deskewAngle: straight.angle,
      perspectiveCorrected: rectified.perspective,
    };
  } finally {
    bitmap.close();
  }
}

async function read(worker: Worker, input: HTMLCanvasElement | File, pageSegmentationMode: string) {
  await worker.setParameters?.({
    tessedit_pageseg_mode: pageSegmentationMode,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(input, {}, { text: true, tsv: true });
  const raw = String(result.data?.text || "");
  const tsv=String(result.data?.tsv || "");const structured = reconstructTsvReceipt(tsv);
  return {
    text: repair(structured?.text || normalizeOcrText(raw)),
    layoutText: structured?.layoutText || preserveOcrLayout(raw),
    confidence: Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null,
    tsv,
    receiptLayout:parseReceiptTsvLayout(tsv),
  };
}

export function scoreReceiptCandidate(text: string, confidence: number | null, hint: DocumentTypeHint) {
  const cleaned = normalizeOcrText(repair(text));
  const characters = visibleChars(cleaned);
  if (characters < 20) return (confidence ?? 0) * 0.15 - 35 + characters * 0.35;
  const metadata = inferDocumentMetadata(cleaned, hint);
  const lines = cleaned.split(/\r?\n/).filter(Boolean).length;
  const decimals = (cleaned.match(/\d+[.,]\d{2}\b/g) || []).length;
  let score = (confidence ?? 0) * 0.8;
  score += Math.min(25, characters / 20);
  score += Math.min(10, lines * 0.65);
  score += Math.min(7, decimals * 0.7);
  if (metadata.documentDate) score += 6;
  if (metadata.amount !== null) score += 8;
  if (metadata.merchant) score += 4;
  if (/\bTOTAL\b/i.test(cleaned)) score += 4;
  return score;
}

function estimatedTableRows(text:string){
  const lines=normalizeOcrText(text).split(/\r?\n/);const header=lines.findIndex(line=>/DESCRIP/i.test(line)&&/PRECI/i.test(line));if(header<0)return 0;let rows=0;
  for(const line of lines.slice(header+1)){if(/\b(BASE|TOTAL|IVA|PENDIENTE|PAGADO)\b/i.test(line))break;const amounts=line.match(/\d+[.,]\d{1,3}\b/g)||[];if(amounts.length>=2&&/\p{L}/u.test(line))rows+=1;}
  return rows;
}

export function shouldRefineReceiptCandidates(candidates: Array<{ text: string; confidence: number | null;receiptLayout?:ReceiptLayout|null }>, hint: DocumentTypeHint) {
  if (!candidates.length) return true;
  const usable = candidates.filter((candidate) => visibleChars(candidate.text) >= 80);
  if (!usable.length) return true;
  const best = candidates.reduce((current, candidate) =>
    scoreReceiptCandidate(candidate.text, candidate.confidence, hint)+(candidate.receiptLayout?.items.length||0)*7 > scoreReceiptCandidate(current.text, current.confidence, hint)+(current.receiptLayout?.items.length||0)*7
      ? candidate
      : current,
  );
  const metadata = inferDocumentMetadata(best.text, hint);
  const items=best.receiptLayout?.items.length||0;const itemConfidence=best.receiptLayout?.items.map(item=>item.confidence).filter((value):value is number=>Number.isFinite(value))||[];
  const weakItems=itemConfidence.length>0&&itemConfidence.reduce((sum,value)=>sum+value,0)/itemConfidence.length<48;
  const missingRows=estimatedTableRows(best.text)>items;
  return visibleChars(best.text)<110||!metadata.documentDate||!metadata.merchant||(hint==="receipt"&&(items===0||missingRows||weakItems));
}

function addCandidate(candidates: Candidate[], variant: string, result: { text: string; layoutText: string; confidence: number | null;tsv:string;receiptLayout:ReceiptLayout|null }, hint: DocumentTypeHint) {
  candidates.push({ variant, ...result, score: scoreReceiptCandidate(result.text, result.confidence, hint)+(result.receiptLayout?.items.length||0)*7+layoutItemsConfidence(result.receiptLayout?.items||[])*.08 });
}

function cropCanvas(source:HTMLCanvasElement,left:number,top:number,width:number,height:number){
  const output=document.createElement("canvas");output.width=Math.max(1,Math.round(width));output.height=Math.max(1,Math.round(height));const context=output.getContext("2d");if(!context)throw new Error("Canvas no disponible");context.fillStyle="#fff";context.fillRect(0,0,output.width,output.height);context.drawImage(source,left,top,width,height,0,0,output.width,output.height);return output;
}

function scaleCanvas(source:HTMLCanvasElement,targetWidth:number){
  const scale=Math.min(2.2,Math.max(1,targetWidth/source.width));if(scale<=1.02)return source;const output=document.createElement("canvas");output.width=Math.round(source.width*scale);output.height=Math.round(source.height*scale);const context=output.getContext("2d");if(!context)return source;context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(source,0,0,output.width,output.height);return output;
}

function summaryZone(tsv:string,width:number,height:number){
  const lines=tsvLines(tsv);const summary=lines.filter(line=>line.top>height*.32&&/\b(BASE|IVA|TOTAL)\b/i.test(line.plain));
  if(summary.length){const lineHeight=Math.max(18,median(summary.map(line=>line.bottom-line.top)));const top=clamp(Math.min(...summary.map(line=>line.top))-lineHeight*2.2,0,height-1);const bottom=clamp(Math.max(...summary.map(line=>line.bottom))+lineHeight*3.2,top+1,height);const left=Math.floor(width*.27);const right=Math.ceil(width*.94);return{left,top:Math.floor(top),width:Math.max(1,right-left),height:Math.max(1,Math.ceil(bottom-top))};}
  return{left:Math.floor(width*.27),top:Math.floor(height*.5),width:Math.floor(width*.67),height:Math.floor(height*.25)};
}

export function extractReceiptTotal(text:string){
  for(const raw of normalizeOcrText(repair(text)).split(/\r?\n/)){
    const line=raw.replace(/^[^\p{L}]+/u,"");if(!/\btotal\b/i.test(line)||/\btotal\s+iva\b/i.test(line))continue;const tail=line.slice(Math.max(0,line.toLowerCase().indexOf("total")+5));const decimals=tail.match(/\d{1,6}[.,]\d{2}\b/g)||[];
    if(decimals.length){const value=parseEuroValue(decimals.at(-1)!);if(value!==null&&value>=0&&value<100000)return value;}
    const collapsed=(tail.match(/\b\d{3,7}\b/g)||[]).at(-1);if(collapsed){const value=Number(`${collapsed.slice(0,-2)}.${collapsed.slice(-2)}`);if(Number.isFinite(value)&&value>=0&&value<100000)return value;}
  }
  return null;
}

function summaryKey(value:string){return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z]/g,"");}

export function reconcileReceiptSummary(summaryLines:ReceiptSummaryLine[],totalAmount:number|null){
  const summary=summaryLines.map(line=>({...line}));
  if(totalAmount===null)return summary;
  const totalValue=totalAmount.toFixed(2);const totalIndex=summary.findIndex(line=>summaryKey(line.label)==="TOTAL");
  if(totalIndex>=0)summary[totalIndex]={label:"Total",value:totalValue};else summary.push({label:"Total",value:totalValue});
  const baseIndex=summary.findIndex(line=>summaryKey(line.label)==="BASE");const taxIndex=summary.findIndex(line=>["IVA","TOTALIVA"].includes(summaryKey(line.label)));
  if(baseIndex>=0&&taxIndex>=0){const base=parseEuroValue(summary[baseIndex].value);const tax=parseEuroValue(summary[taxIndex].value);const inferredBase=totalAmount-(tax??0);
    if(base!==null&&tax!==null&&inferredBase>=0&&Math.abs(base+tax-totalAmount)>.04)summary[baseIndex]={label:"Base",value:inferredBase.toFixed(2)};
  }
  return summary;
}

function withSummary(layout:ReceiptLayout|null,text:string,totalAmount:number|null){
  if(!layout)return null;const detected=parseReceiptLayout(text).summary;const summary:ReceiptSummaryLine[]=[];const seen=new Set<string>();
  for(const line of [...layout.summary,...detected]){const key=summaryKey(line.label);if(!key||seen.has(key))continue;seen.add(key);summary.push(line);}
  return{...layout,summary:reconcileReceiptSummary(summary,totalAmount),source:"geometry_tsv" as const};
}

function layoutItemsConfidence(items:ReceiptLineItem[]){const values=items.map(item=>item.confidence).filter((value):value is number=>Number.isFinite(value));return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}

function itemKey(item:ReceiptLineItem){return `${item.quantity}|${item.unitPrice.replace(",",".")}|${item.total.replace(",",".")}`;}
function descriptionLetters(value:string){return(value.match(/\p{L}/gu)||[]).length;}
function descriptionTokens(value:string){return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[A-Z0-9]+/g)||[];}

function mergeReceiptLayouts(selected:ReceiptLayout|null,candidates:Candidate[]){
  if(!selected)return null;const alternatives=candidates.map(candidate=>candidate.receiptLayout).filter((layout):layout is ReceiptLayout=>Boolean(layout));
  const items=selected.items.map((item)=>{let choice=item;const key=itemKey(item);const ambiguous=selected.items.filter(candidate=>itemKey(candidate)===key).length>1;
    for(const layout of alternatives){for(const candidate of layout.items){if(itemKey(candidate)!==key)continue;const overlapWords=new Set(descriptionTokens(item.description));const overlap=descriptionTokens(candidate.description).some(word=>overlapWords.has(word));if(ambiguous&&!overlap)continue;const richer=descriptionLetters(candidate.description)>=descriptionLetters(choice.description)+2&&(candidate.confidence??0)>=(choice.confidence??0)-25;const clearer=(candidate.confidence??0)>=(choice.confidence??0)+15&&descriptionLetters(candidate.description)>=descriptionLetters(choice.description);if(richer||clearer)choice=candidate;}}
    return choice;
  });
  const merchantLayout=alternatives.reduce((current,layout)=>merchantScore(inferDocumentMetadata(receiptLayoutToText(layout),"receipt").merchant)>merchantScore(inferDocumentMetadata(receiptLayoutToText(current),"receipt").merchant)?layout:current,selected);
  return{...selected,header:merchantLayout.header,items,source:"geometry_tsv" as const};
}

function merchantScore(value:string|null){
  if(!value)return-Infinity;const letters=descriptionLetters(value);const digits=(value.match(/\d/g)||[]).length;const amounts=(value.match(/\d+[.,]\d{2}/g)||[]).length;let score=letters-digits*3-amounts*18;if(/\b(BAR|CAFE|CAFÉ|RESTAURANTE|SUPERMERCADO|ESTANCO|FARMACIA|TIENDA|HOTEL|MES[ÓO]N|TABERNA)\b/i.test(value))score+=35;return score;
}

function chooseMetadata(text:string,candidates:Candidate[],hint:DocumentTypeHint,totalAmount:number|null){
  const final=inferDocumentMetadata(text,hint);const alternates=candidates.map(candidate=>inferDocumentMetadata(candidate.text,hint));const merchant=[final,...alternates].map(meta=>meta.merchant).reduce((best,value)=>merchantScore(value)>merchantScore(best)?value:best,null as string|null);
  return{...final,documentDate:final.documentDate??alternates.map(meta=>meta.documentDate).find((value):value is string=>Boolean(value))??null,amount:totalAmount??final.amount??alternates.map(meta=>meta.amount).find((value):value is number=>value!==null)??null,merchant};
}

export async function recognizeTicketImage(
  file: File,
  worker: Worker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const candidates: Candidate[] = [];
  let deskewAngle = 0;
  let perspectiveCorrected = false;
  let prepared:Awaited<ReturnType<typeof variants>>|null=null;
  try {
    onProgress(0.05, "Preparando una lectura rápida del ticket");
    prepared = await variants(file);
    deskewAngle = prepared.deskewAngle;
    perspectiveCorrected = prepared.perspectiveCorrected;
    onProgress(0.18, perspectiveCorrected || deskewAngle ? "Corrigiendo perspectiva, luz y giro" : "Corrigiendo luz y contraste");
    onProgress(0.28, "Leyendo texto, columnas y precios");
    addCandidate(candidates, "adaptive_local_psm6", await read(worker, prepared.adaptive, "6"), hint);
    if (shouldRefineReceiptCandidates(candidates, hint)) {
      onProgress(0.62, "Afinando únicamente los caracteres dudosos");
      addCandidate(candidates, "adaptive_columns_psm4", await read(worker, prepared.adaptive, "4"), hint);
    }
  } catch {
    onProgress(0.58, "Leyendo la imagen original");
    addCandidate(candidates, "original_psm6", await read(worker, file, "6"), hint);
  }

  const best = candidates.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));
  let receiptLayout=best.receiptLayout;const textLayout=parseReceiptLayout(best.text);if((textLayout.items.length||0)>(receiptLayout?.items.length||0))receiptLayout=textLayout;receiptLayout=mergeReceiptLayouts(receiptLayout,candidates);
  let totalAmount=receiptLayoutTotal(receiptLayout)??candidates.map(candidate=>inferDocumentMetadata(candidate.text,hint).amount).find((value):value is number=>value!==null)??null;let totalsPass:Awaited<ReturnType<typeof read>>|null=null;
  if(prepared&&hint==="receipt"&&totalAmount===null){
    onProgress(0.8,"Confirmando Base, IVA y Total");const zone=summaryZone(best.tsv,prepared.adaptive.width,prepared.adaptive.height);const canvas=scaleCanvas(cropCanvas(prepared.adaptive,zone.left,zone.top,zone.width,zone.height),1500);totalsPass=await read(worker,canvas,"6");totalAmount=extractReceiptTotal(totalsPass.text);
  }
  receiptLayout=withSummary(receiptLayout,totalsPass?.text||best.text,totalAmount);
  const finalText=receiptLayout?.items.length?receiptLayoutToText(receiptLayout):best.text;
  const metadata=chooseMetadata(finalText,candidates,hint,totalAmount);
  onProgress(0.97, "Validando comercio, fecha e importe");
  const result = {
    text: finalText,
    layoutText: best.layoutText,
    confidence: best.confidence,
    method: `image_ocr_receipt_v501:${best.variant}`,
    passes: [...candidates.map(({ variant, confidence, score }) => ({ variant, confidence, score: Math.round(score * 10) / 10 })),...(totalsPass?[{variant:"totals_zone_adaptive_psm6",confidence:totalsPass.confidence,score:totalAmount??0}]:[])],
    receiptLayout,
    metadata,
  } as ImageOcrResult & { deskewAngle?: number; perspectiveCorrected?: boolean };
  result.deskewAngle = deskewAngle;
  result.perspectiveCorrected = perspectiveCorrected;
  return result;
}
