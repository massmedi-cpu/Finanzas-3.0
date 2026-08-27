import {
  inferDocumentMetadata,
  localAdaptiveThreshold,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  recognizeTicketImage as recognizeLegacyTicket,
  reconstructTsvReceipt,
  scoreReceiptCandidate,
  shouldRefineReceiptCandidates,
  extractReceiptTotal,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr-geometry";
import {
  parseReceiptLayout,
  parseReceiptTsvLayout,
  parseTsvWords,
  receiptLayoutTotal,
  tsvLines,
  type ReceiptLayout,
} from "./receipt-layout";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentMetadata, DocumentTypeHint, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};
type Bounds={left:number;top:number;width:number;height:number};
type Candidate={
  variant:string;
  text:string;
  layoutText:string;
  confidence:number|null;
  tsv:string;
  receiptLayout:ReceiptLayout|null;
  score:number;
};

const letterCount=(value:string)=>(value.match(/\p{L}/gu)||[]).length;
const wordCount=(value:string)=>(value.match(/[\p{L}]{2,}/gu)||[]).length;
const compactWords=(value:string)=>value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function repairReceiptNumbers(line:string){
  if(/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/.test(line))return line;
  return line
    .replace(/\b(\d)(\d{2})(?=\s+\d+[.,]\d{2}\b)/g,"$1.$2")
    .replace(/\b(\d{1,2})\s+(\d{2})(?=\s+\d+[.,]\d{2}\b)/g,"$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi,"$1$2,$3");
}

function numericSignature(line:string){
  const repaired=repairReceiptNumbers(line);
  const values=repaired.match(/\d+(?:[.,:]\d{2})/g)||[];
  return values.length?values.slice(-2).map(value=>value.replace(",",".")).join("|"):"";
}

function lexicalOverlap(a:string,b:string){
  const left=new Set(compactWords(a).filter(word=>/[A-Z]/.test(word)));
  const right=new Set(compactWords(b).filter(word=>/[A-Z]/.test(word)));
  if(!left.size||!right.size)return 0;
  let hits=0;for(const word of left)if(right.has(word))hits+=1;
  return hits/Math.max(left.size,right.size);
}

function lineQuality(raw:string){
  const line=repairReceiptNumbers(raw).trim();
  const letters=letterCount(line);const words=wordCount(line);const decimals=(line.match(/\d+[.,]\d{2}\b/g)||[]).length;
  const singleNoise=(line.match(/(?:^|\s)[A-Z](?=\s|$)/g)||[]).length;const collapsedPrice=(line.match(/\b\d{3,4}(?=\s+\d+[.,]\d{2}\b)/g)||[]).length;
  let score=letters*.22+words*1.15+decimals*2.7-singleNoise*2.1-collapsedPrice*3.2;
  if(/\b(TOTAL|IVA|BASE|HORA|FECHA|MESA|CAMARERO|PRECIO|IMPORTE|PENDIENTE|POWERED)\b/i.test(line))score+=3;
  if(line.length>4&&line.length<100)score+=1;
  return score;
}

export function mergeReceiptTexts(primaryText:string,alternateText:string){
  const primary=normalizeOcrText(primaryText).split(/\r?\n/).filter(Boolean);
  const alternate=normalizeOcrText(alternateText).split(/\r?\n/).filter(Boolean);
  if(!primary.length)return normalizeOcrText(alternateText);if(!alternate.length)return normalizeOcrText(primaryText);
  const used=new Set<number>();
  const merged=primary.map((source,sourceIndex)=>{
    const signature=numericSignature(source);let bestIndex=-1;let bestFit=-Infinity;
    for(let index=0;index<alternate.length;index+=1){
      if(used.has(index))continue;const candidate=alternate[index];const candidateSignature=numericSignature(candidate);const distance=Math.abs(index-sourceIndex);let fit=-distance*.35;
      if(signature&&candidateSignature===signature)fit+=8;else if(signature||candidateSignature)fit-=3;
      fit+=lexicalOverlap(source,candidate)*5;
      if(fit>bestFit){bestFit=fit;bestIndex=index;}
    }
    if(bestIndex<0||bestFit<1.5)return repairReceiptNumbers(source);
    const candidate=alternate[bestIndex];const candidateSignature=numericSignature(candidate);const sourceQuality=lineQuality(source);const candidateQuality=lineQuality(candidate);const samePrices=Boolean(signature)&&candidateSignature===signature;
    const richer=samePrices&&candidateQuality>=sourceQuality-.25&&(letterCount(candidate)>=letterCount(source)+1||wordCount(candidate)>=wordCount(source)+1);
    if(candidateQuality>sourceQuality+.9||richer){used.add(bestIndex);return repairReceiptNumbers(candidate);}
    return repairReceiptNumbers(source);
  });
  for(let index=0;index<alternate.length;index+=1){
    if(used.has(index))continue;const line=repairReceiptNumbers(alternate[index]);
    if(lineQuality(line)>=5&&!merged.some(existing=>lexicalOverlap(existing,line)>.72&&numericSignature(existing)===numericSignature(line)))merged.push(line);
  }
  return normalizeOcrText(merged.join("\n"));
}

function quantile(values:number[],q:number){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const index=Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*q)));return sorted[index];}

export function detectReceiptTextBounds(tsv:string,width:number,height:number):Bounds{
  const lines=tsvLines(tsv);const anchor=lines.find(line=>/DESCRIP/i.test(line.plain)&&/PRECI/i.test(line.plain));
  if(anchor){
    const anchorLeft=Math.min(...anchor.words.map(word=>word.left));const anchorRight=Math.max(...anchor.words.map(word=>word.left+word.width));const anchorWidth=Math.max(1,anchorRight-anchorLeft);
    const left=clamp(anchorLeft-anchorWidth*.08,0,width-1);const right=clamp(anchorRight+anchorWidth*.09,left+1,width);
    const aligned=lines.filter(line=>{
      const useful=line.words.filter(word=>word.conf>=12);if(!useful.length)return false;
      const inside=useful.filter(word=>word.left+word.width/2>=left&&word.left+word.width/2<=right).length;
      return inside/ useful.length>=.55;
    });
    if(aligned.length>=6){
      const top=Math.min(...aligned.map(line=>line.top));let bottom=Math.max(...aligned.map(line=>line.bottom));
      const strongFooter=[...aligned].reverse().find(line=>/\b(POWERED|TERRAZA|MESA|PENDIENTE|PAGADO|GRACIAS)\b/i.test(line.plain));
      if(strongFooter)bottom=Math.max(bottom,strongFooter.bottom);
      const contentHeight=Math.max(1,bottom-top);
      return{
        left:Math.floor(clamp(left-anchorWidth*.025,0,width-1)),
        top:Math.floor(clamp(top-contentHeight*.055,0,height-1)),
        width:Math.ceil(clamp(right+anchorWidth*.025,left+1,width)-clamp(left-anchorWidth*.025,0,width-1)),
        height:Math.ceil(clamp(bottom+contentHeight*.07,top+1,height)-clamp(top-contentHeight*.055,0,height-1)),
      };
    }
  }
  const words=parseTsvWords(tsv).filter(word=>word.conf>=20&&word.height<height*.09&&word.width>=word.height*.48);
  if(words.length<12)return{left:0,top:0,width,height};
  const lefts=words.map(word=>word.left);const rights=words.map(word=>word.left+word.width);const tops=words.map(word=>word.top);const bottoms=words.map(word=>word.top+word.height);
  let left=quantile(lefts,.06);let right=quantile(rights,.94);let top=quantile(tops,.02);let bottom=quantile(bottoms,.98);const contentWidth=right-left;const contentHeight=bottom-top;
  if(contentWidth<width*.28||contentHeight<height*.30)return{left:0,top:0,width,height};
  left=clamp(left-contentWidth*.08,0,width-1);right=clamp(right+contentWidth*.08,left+1,width);top=clamp(top-contentHeight*.05,0,height-1);bottom=clamp(bottom+contentHeight*.06,top+1,height);
  return{left:Math.floor(left),top:Math.floor(top),width:Math.ceil(right-left),height:Math.ceil(bottom-top)};
}

function scaleCanvas(source:HTMLCanvasElement,targetWidth:number,maxHeight=2600){
  let scale=targetWidth/source.width;if(source.height*scale>maxHeight)scale=maxHeight/source.height;scale=clamp(scale,.45,2.1);
  if(Math.abs(scale-1)<.03)return source;const output=document.createElement("canvas");output.width=Math.max(1,Math.round(source.width*scale));output.height=Math.max(1,Math.round(source.height*scale));const context=output.getContext("2d");if(!context)return source;
  context.fillStyle="#fff";context.fillRect(0,0,output.width,output.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(source,0,0,output.width,output.height);return output;
}

function cropCanvas(source:HTMLCanvasElement,bounds:Bounds){
  const left=clamp(Math.floor(bounds.left),0,source.width-1);const top=clamp(Math.floor(bounds.top),0,source.height-1);const width=Math.max(1,Math.min(source.width-left,Math.ceil(bounds.width)));const height=Math.max(1,Math.min(source.height-top,Math.ceil(bounds.height)));
  const output=document.createElement("canvas");output.width=width;output.height=height;const context=output.getContext("2d");if(!context)throw new Error("Canvas no disponible");context.fillStyle="#fff";context.fillRect(0,0,width,height);context.drawImage(source,left,top,width,height,0,0,width,height);return output;
}

async function baseCanvas(file:File){
  const bitmap=await createImageBitmap(file);try{
    let scale=Math.min(1,1500/Math.max(1,bitmap.width),2800/Math.max(1,bitmap.height));if(bitmap.width<950)scale=Math.min(1.55,1250/Math.max(1,bitmap.width));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Canvas no disponible");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
  }finally{bitmap.close();}
}

function grayscaleCanvas(source:HTMLCanvasElement,targetWidth:number){
  const scaled=scaleCanvas(source,targetWidth);const output=document.createElement("canvas");output.width=scaled.width;output.height=scaled.height;const context=output.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Canvas no disponible");context.drawImage(scaled,0,0);const data=context.getImageData(0,0,output.width,output.height);
  let min=255,max=0;const values=new Uint8ClampedArray(data.data.length);
  for(let offset=0;offset<data.data.length;offset+=4){const value=Math.round(data.data[offset]*.2126+data.data[offset+1]*.7152+data.data[offset+2]*.0722);min=Math.min(min,value);max=Math.max(max,value);values[offset]=values[offset+1]=values[offset+2]=value;values[offset+3]=255;}
  const range=Math.max(45,max-min);for(let offset=0;offset<values.length;offset+=4){const value=clamp(Math.round((values[offset]-min)*235/range+10),0,255);values[offset]=values[offset+1]=values[offset+2]=value;}
  context.putImageData(new ImageData(values,output.width,output.height),0,0);return output;
}

function adaptiveCanvas(source:HTMLCanvasElement,targetWidth:number){
  const gray=grayscaleCanvas(source,targetWidth);const context=gray.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Canvas no disponible");const data=context.getImageData(0,0,gray.width,gray.height);const threshold=localAdaptiveThreshold(data.data,gray.width,gray.height);context.putImageData(new ImageData(threshold,gray.width,gray.height),0,0);return gray;
}

async function read(worker:Worker,input:HTMLCanvasElement|File,pageSegmentationMode:string){
  await worker.setParameters?.({tessedit_pageseg_mode:pageSegmentationMode,preserve_interword_spaces:"1",user_defined_dpi:"300"});
  const result=await worker.recognize(input,{}, {text:true,tsv:true});const raw=String(result.data?.text||"");const tsv=String(result.data?.tsv||"");const structured=reconstructTsvReceipt(tsv);
  return{text:repairReceiptNumbers(structured?.text||normalizeOcrText(raw)),layoutText:structured?.layoutText||preserveOcrLayout(raw),confidence:Number.isFinite(result.data?.confidence)?Number(result.data?.confidence):null,tsv,receiptLayout:parseReceiptTsvLayout(tsv)};
}

function addCandidate(candidates:Candidate[],variant:string,result:Awaited<ReturnType<typeof read>>,hint:DocumentTypeHint){
  const items=result.receiptLayout?.items.length||0;candidates.push({variant,...result,score:scoreReceiptCandidate(result.text,result.confidence,hint)+items*8});
}

function bestLayout(candidates:Candidate[],mergedText:string){
  const layouts=candidates.map(candidate=>candidate.receiptLayout).filter((layout):layout is ReceiptLayout=>Boolean(layout));const textLayout=parseReceiptLayout(mergedText);if(textLayout.items.length)layouts.push(textLayout);if(!layouts.length)return null;
  return layouts.reduce((best,current)=>{
    const score=(layout:ReceiptLayout)=>layout.items.length*100+layout.summary.length*15+layout.header.length*2;
    return score(current)>score(best)?current:best;
  });
}

function summaryCrop(source:HTMLCanvasElement){
  const top=Math.floor(source.height*.48);return cropCanvas(source,{left:Math.floor(source.width*.22),top,width:Math.floor(source.width*.76),height:source.height-top});
}

function selectMerchant(candidates:string[]){
  const blocked=/^(?:DESCRIP|TOTAL|BASE|IVA|PENDIENTE|PAGADO|MESA|TERRAZA|POWERED)/i;const choices=candidates.filter(Boolean).filter(value=>!blocked.test(value));if(!choices.length)return null;
  return choices.reduce((best,value)=>{const score=(text:string)=>letterCount(text)-((text.match(/\d/g)||[]).length*2)+(/\b(BAR|CAFE|CAFÉ|RESTAURANTE|SUPERMERCADO|ESTANCO|FARMACIA|TIENDA|HOTEL|TABERNA)\b/i.test(text)?30:0);return score(value)>score(best)?value:best;});
}

export async function recognizeTicketImage(file:File,worker:Worker,onProgress:(value:number,label:string)=>void,hint:DocumentTypeHint=null):Promise<ImageOcrResult>{
  if(hint!=="receipt")return recognizeLegacyTicket(file,worker,onProgress,hint);
  const candidates:Candidate[]=[];
  try{
    onProgress(.05,"Preparando el ticket");const base=await baseCanvas(file);
    onProgress(.13,"Localizando solo el papel y su tabla");const locator=adaptiveCanvas(base,900);const locatorRead=await read(worker,locator,"6");addCandidate(candidates,"locator_adaptive_psm6",locatorRead,hint);
    const locatorBounds=detectReceiptTextBounds(locatorRead.tsv,locator.width,locator.height);const scaleX=base.width/locator.width;const scaleY=base.height/locator.height;
    const mapped:Bounds={left:locatorBounds.left*scaleX,top:locatorBounds.top*scaleY,width:locatorBounds.width*scaleX,height:locatorBounds.height*scaleY};
    const areaRatio=(mapped.width*mapped.height)/(base.width*base.height);const receipt=areaRatio<.94?cropCanvas(base,mapped):base;

    onProgress(.43,areaRatio<.94?"Leyendo el ticket recortado con máxima precisión":"Leyendo el ticket con máxima precisión");const primaryCanvas=adaptiveCanvas(receipt,1320);const primary=await read(worker,primaryCanvas,"6");addCandidate(candidates,"fastcrop_adaptive_psm6",primary,hint);

    let alternate:Awaited<ReturnType<typeof read>>|null=null;
    if(shouldRefineReceiptCandidates([{text:primary.text,confidence:primary.confidence,receiptLayout:primary.receiptLayout}],hint)){
      onProgress(.69,"Recuperando letras débiles de pliegues y sombras");const gray=grayscaleCanvas(receipt,1450);alternate=await read(worker,gray,"6");addCandidate(candidates,"fastcrop_gray_psm6",alternate,hint);
    }

    const merged=alternate?mergeReceiptTexts(primary.text,alternate.text):normalizeOcrText(primary.text);let layout=bestLayout(candidates,merged);let total=receiptLayoutTotal(layout)??extractReceiptTotal(merged);
    let totalsPass:Awaited<ReturnType<typeof read>>|null=null;
    if(total===null){
      onProgress(.84,"Confirmando el total");totalsPass=await read(worker,scaleCanvas(summaryCrop(receipt),1150,1250),"6");total=extractReceiptTotal(totalsPass.text)??receiptLayoutTotal(totalsPass.receiptLayout);if(totalsPass.receiptLayout)candidates.push({variant:"summary_zone_psm6",...totalsPass,score:scoreReceiptCandidate(totalsPass.text,totalsPass.confidence,hint)});
    }
    if(!layout)layout=bestLayout(candidates,merged);
    const metas=[inferDocumentMetadata(merged,hint),...candidates.map(candidate=>inferDocumentMetadata(candidate.text,hint))];const first=metas[0];const merchant=selectMerchant(metas.map(meta=>meta.merchant||""))??first.merchant;const documentDate=first.documentDate??metas.map(meta=>meta.documentDate).find((value):value is string=>Boolean(value))??null;const amount=total??first.amount??metas.map(meta=>meta.amount).find((value):value is number=>value!==null)??null;
    const best=candidates.filter(candidate=>candidate.variant!=="locator_adaptive_psm6"&&candidate.variant!=="summary_zone_psm6").reduce((current,candidate)=>candidate.score>current.score?candidate:current,candidates[0]);
    onProgress(.97,"Validando comercio, fecha, líneas e importe");
    return{
      text:merged,
      layoutText:best.layoutText,
      confidence:best.confidence,
      method:`image_ocr_receipt_v501:fastcrop_v2:${best.variant}`,
      passes:candidates.map(({variant,confidence,score})=>({variant,confidence,score:Math.round(score*10)/10})),
      receiptLayout:layout,
      metadata:{documentType:"receipt",documentDate,amount,merchant,lines:normalizeOcrText(merged).split(/\r?\n/).filter(Boolean)},
    };
  }catch{
    onProgress(.55,"Usando lectura de compatibilidad");return recognizeLegacyTicket(file,worker,onProgress,hint);
  }
}
