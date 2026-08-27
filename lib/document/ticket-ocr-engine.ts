import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  type DocumentMetadata,
  type DocumentTypeHint,
  type ImageOcrResult,
} from "./ticket-ocr";
import {
  parseReceiptLayout,
  parseReceiptTsvLayout,
  parseTsvWords,
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
type Bounds={left:number;top:number;width:number;height:number};
type OcrPass={variant:string;text:string;layoutText:string;confidence:number|null;tsv:string;receiptLayout:ReceiptLayout|null;score:number};

const letterCount=(value:string)=>(value.match(/\p{L}/gu)||[]).length;
const wordCount=(value:string)=>(value.match(/[\p{L}]{2,}/gu)||[]).length;
const compactWords=(value:string)=>value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const visibleChars=(value:string)=>value.replace(/\s/g,"").length;

function repairReceiptNumbers(line:string){
  if(/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/.test(line))return line;
  return line
    .replace(/\b(\d)(\d{2})(?=\s+\d+[.,]\d{2}\b)/g,"$1.$2")
    .replace(/\b(\d{1,2})\s+(\d{2})(?=\s+\d+[.,]\d{2}\b)/g,"$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi,"$1$2,$3");
}

function joinTinyHeaderContinuations(raw:string){
  const lines=String(raw||"").replace(/\r/g,"").split("\n");
  const merged:string[]=[];
  for(let index=0;index<lines.length;index+=1){
    const line=lines[index].trimEnd();
    const compact=line.trim();
    if(index<9&&/^[\p{L}]{1,2}$/u.test(compact)&&merged.length&&/[\p{L}]$/u.test(merged.at(-1)!.trim())){
      merged[merged.length-1]=`${merged.at(-1)!.trimEnd()}${compact}`;
      continue;
    }
    merged.push(line);
  }
  return merged.join("\n");
}

function normalizeRawText(raw:string){
  return normalizeOcrText(joinTinyHeaderContinuations(raw).split(/\r?\n/).map(repairReceiptNumbers).join("\n"));
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
  const singleNoise=(line.match(/(?:^|\s)[A-Z](?=\s|$)/g)||[]).length;
  let score=letters*.22+words*1.15+decimals*2.7-singleNoise*2.1;
  if(/\b(TOTAL|IVA|BASE|HORA|FECHA|MESA|PRECIO|IMPORTE|DESCRIPCION)\b/i.test(line))score+=3;
  if(line.length>4&&line.length<90)score+=1;
  return score;
}

export function mergeReceiptTexts(primaryText:string,alternateText:string){
  const primary=normalizeRawText(primaryText).split(/\r?\n/).filter(Boolean);
  const alternate=normalizeRawText(alternateText).split(/\r?\n/).filter(Boolean);
  if(!primary.length)return normalizeRawText(alternateText);
  if(!alternate.length)return normalizeRawText(primaryText);
  const used=new Set<number>();
  const merged=primary.map((source,sourceIndex)=>{
    const signature=numericSignature(source);let bestIndex=-1;let bestFit=-Infinity;
    for(let index=0;index<alternate.length;index+=1){
      if(used.has(index))continue;const candidate=alternate[index];const candidateSignature=numericSignature(candidate);const distance=Math.abs(index-sourceIndex);
      let fit=-distance*.35;if(signature&&candidateSignature===signature)fit+=8;else if(signature||candidateSignature)fit-=3;fit+=lexicalOverlap(source,candidate)*5;
      if(fit>bestFit){bestFit=fit;bestIndex=index;}
    }
    if(bestIndex<0||bestFit<1.5)return repairReceiptNumbers(source);
    const candidate=alternate[bestIndex];const candidateSignature=numericSignature(candidate);
    const sourceQuality=lineQuality(source);const candidateQuality=lineQuality(candidate);const sameNumbers=Boolean(signature)&&candidateSignature===signature;
    const richerMatchingLine=sameNumbers&&candidateQuality>=sourceQuality-.35&&(letterCount(candidate)>=letterCount(source)+1||wordCount(candidate)>=wordCount(source)+1);
    if(candidateQuality>sourceQuality+.9||richerMatchingLine){used.add(bestIndex);return repairReceiptNumbers(candidate);}
    return repairReceiptNumbers(source);
  });
  for(let index=0;index<alternate.length;index+=1){
    if(used.has(index))continue;
    const candidate=alternate[index];
    if(lineQuality(candidate)>=4&&!merged.some(line=>numericSignature(line)&&numericSignature(line)===numericSignature(candidate)))merged.push(candidate);
  }
  return normalizeRawText(merged.join("\n"));
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

function scorePass(text:string,confidence:number|null,hint:DocumentTypeHint,layout:ReceiptLayout|null){
  const meta=inferDocumentMetadata(text,hint);let score=(confidence??0)*.55+Math.min(30,visibleChars(text)/18)+Math.min(15,text.split(/\n/).length*.7);
  if(meta.merchant)score+=8;if(meta.documentDate)score+=8;if(meta.amount!==null)score+=10;if(/\bTOTAL\b/i.test(text))score+=4;
  score+=(layout?.items.length||0)*3;
  return score;
}

function shouldRunFallback(pass:OcrPass,hint:DocumentTypeHint){
  const meta=inferDocumentMetadata(pass.text,hint);
  if(visibleChars(pass.text)<95)return true;
  if(!meta.merchant||!meta.documentDate||meta.amount===null)return true;
  if(hint==="receipt"&&(pass.receiptLayout?.items.length||0)===0)return true;
  return false;
}

async function prepareReceiptCanvas(file:File){
  const bitmap=await createImageBitmap(file);
  try{
    let sx=0;let sy=0;let sw=bitmap.width;let sh=bitmap.height;
    const aspect=sw/Math.max(1,sh);
    if(sh>sw&&aspect>.68){
      const targetAspect=.62;const targetWidth=Math.min(sw,Math.round(sh*targetAspect));
      sx=Math.max(0,Math.round((sw-targetWidth)/2));sw=targetWidth;
    }
    let scale=1;
    if(sw>1300)scale=1300/sw;
    if(sh*scale>2500)scale=Math.min(scale,2500/sh);
    if(sw*scale<950)scale=Math.min(1.35,950/sw);
    const width=Math.max(1,Math.round(sw*scale));const height=Math.max(1,Math.round(sh*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Canvas no disponible");
    context.fillStyle="#fff";context.fillRect(0,0,width,height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
    context.drawImage(bitmap,sx,sy,sw,sh,0,0,width,height);
    const data=context.getImageData(0,0,width,height);let min=255,max=0;
    const gray=new Uint8ClampedArray(data.data.length);
    for(let offset=0;offset<data.data.length;offset+=4){
      const lum=Math.round(data.data[offset]*.2126+data.data[offset+1]*.7152+data.data[offset+2]*.0722);min=Math.min(min,lum);max=Math.max(max,lum);gray[offset]=gray[offset+1]=gray[offset+2]=lum;gray[offset+3]=255;
    }
    const low=Math.min(185,min+18);const high=Math.max(low+40,Math.max(215,max-8));
    for(let offset=0;offset<gray.length;offset+=4){const value=clamp(Math.round((gray[offset]-low)*255/Math.max(1,high-low)),0,255);gray[offset]=gray[offset+1]=gray[offset+2]=value;}
    context.putImageData(new ImageData(gray,width,height),0,0);
    return canvas;
  }finally{bitmap.close();}
}

function adaptiveCanvas(source:HTMLCanvasElement){
  const context=source.getContext("2d",{willReadFrequently:true});if(!context)return source;
  const data=context.getImageData(0,0,source.width,source.height);const out=new Uint8ClampedArray(data.data.length);const width=source.width;const height=source.height;const stride=width+1;const integral=new Uint32Array(stride*(height+1));
  for(let y=1;y<=height;y+=1){let row=0;for(let x=1;x<=width;x+=1){row+=data.data[((y-1)*width+x-1)*4];integral[y*stride+x]=integral[(y-1)*stride+x]+row;}}
  const radius=clamp(Math.round(Math.min(width,height)/42),15,34);
  for(let y=0;y<height;y+=1){const top=Math.max(0,y-radius);const bottom=Math.min(height,y+radius+1);for(let x=0;x<width;x+=1){const left=Math.max(0,x-radius);const right=Math.min(width,x+radius+1);const area=(right-left)*(bottom-top);const sum=integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left];const sourceOffset=(y*width+x)*4;const value=data.data[sourceOffset]<sum/Math.max(1,area)*.91?0:255;out[sourceOffset]=out[sourceOffset+1]=out[sourceOffset+2]=value;out[sourceOffset+3]=255;}}
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;canvas.getContext("2d")?.putImageData(new ImageData(out,width,height),0,0);return canvas;
}

async function readPass(worker:Worker,input:HTMLCanvasElement,psm:string,variant:string,hint:DocumentTypeHint):Promise<OcrPass>{
  await worker.setParameters?.({tessedit_pageseg_mode:psm,preserve_interword_spaces:"1",user_defined_dpi:"300"});
  const result=await worker.recognize(input,{}, {text:true,tsv:true});
  const raw=String(result.data?.text||"");const text=normalizeRawText(raw);const tsv=String(result.data?.tsv||"");
  const tsvLayout=parseReceiptTsvLayout(tsv);const textLayout=parseReceiptLayout(text);const receiptLayout=(textLayout.items.length>(tsvLayout?.items.length||0)?textLayout:tsvLayout)||null;
  const confidence=Number.isFinite(result.data?.confidence)?Number(result.data?.confidence):null;
  return{variant,text,layoutText:preserveOcrLayout(joinTinyHeaderContinuations(raw)),confidence,tsv,receiptLayout,score:scorePass(text,confidence,hint,receiptLayout)};
}

export async function recognizeTicketImage(file:File,worker:Worker,onProgress:(value:number,label:string)=>void,hint:DocumentTypeHint=null):Promise<ImageOcrResult>{
  onProgress(.05,"Recortando y preparando el ticket");
  const prepared=await prepareReceiptCanvas(file);
  onProgress(.22,"Leyendo el ticket completo");
  const first=await readPass(worker,prepared,"6","gray_crop_psm6",hint);const passes=[first];
  if(shouldRunFallback(first,hint)){
    onProgress(.62,"Reforzando solo una lectura difícil");
    const second=await readPass(worker,adaptiveCanvas(prepared),"4","adaptive_crop_psm4",hint);passes.push(second);
  }
  let best=passes.reduce((current,candidate)=>candidate.score>current.score?candidate:current);
  if(passes.length>1){
    const alternate=passes.find(pass=>pass!==best)!;const merged=mergeReceiptTexts(best.text,alternate.text);
    const mergedLayout=parseReceiptLayout(merged);const mergedScore=scorePass(merged,best.confidence,hint,mergedLayout.items.length?mergedLayout:best.receiptLayout);
    if(mergedScore>=best.score-1){best={...best,text:merged,receiptLayout:mergedLayout.items.length?mergedLayout:best.receiptLayout,score:mergedScore};}
  }
  const metadata=inferDocumentMetadata(best.text,hint);const layoutAmount=receiptLayoutTotal(best.receiptLayout);
  const finalMetadata={...metadata,amount:layoutAmount??metadata.amount};
  onProgress(.94,"Validando comercio, fecha e importe");
  return{
    text:best.text,
    layoutText:best.layoutText||best.text,
    confidence:best.confidence,
    method:`image_ocr_receipt_v501:r2:${best.variant}`,
    passes:passes.map(pass=>({variant:pass.variant,confidence:pass.confidence,score:Math.round(pass.score*10)/10})),
    receiptLayout:best.receiptLayout,
    metadata:finalMetadata,
  };
}
