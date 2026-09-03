import fs from "node:fs";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { SERVER_RECEIPT_OCR_RUNTIME } from "./receipt-ocr-provenance";
import { readServerImageMetadata } from "./server-image-metadata";

const DEFAULT_MAX_BYTES=5*1024*1024;
const DEFAULT_MAX_SIDE=12_000;
const DEFAULT_MAX_PIXELS=80_000_000;
const DEFAULT_TIMEOUT_MS=45_000;
const DEFAULT_QUEUE_TIMEOUT_MS=8_000;
const OCR_LANGUAGE_ROOT=path.join(process.cwd(),"node_modules","@tesseract.js-data","spa","4.0.0");
const OCR_RUNTIME_FILES=[
  path.join(process.cwd(),"node_modules","tesseract.js","src","worker-script","node","index.js"),
  path.join(process.cwd(),"node_modules","tesseract.js-core","package.json"),
  path.join(process.cwd(),"node_modules","regenerator-runtime","runtime.js"),
  path.join(OCR_LANGUAGE_ROOT,"spa.traineddata.gz"),
] as const;

type TesseractWorker=Awaited<ReturnType<typeof createWorker>>;
type UnknownRecord=Record<string,unknown>;
export type ServerReceiptOcrItem={text:string;score:number;poly:number[][]};
export type ServerReceiptOcrResult={
  image:{width:number;height:number};
  items:ServerReceiptOcrItem[];
  rawText:string;
  confidence:number|null;
  metrics:{detMs:number;recMs:number;totalMs:number;detectedBoxes:number;recognizedCount:number};
  runtime:typeof SERVER_RECEIPT_OCR_RUNTIME;
};
export type ServerReceiptOcrOptions={
  maxBytes?:number;
  maxSide?:number;
  maxPixels?:number;
  timeoutMs?:number;
  queueTimeoutMs?:number;
};

type TimeoutKind="ocr_queue"|"ocr_worker"|"ocr_recognize";
class TimeoutError extends Error{
  constructor(readonly kind:TimeoutKind){super("ocr_timeout");this.name="OcrTimeoutError";}
}
export class ServerReceiptOcrError extends Error{
  constructor(readonly code:string,readonly status:number,readonly retryable:boolean,cause?:unknown){
    super(code,{cause});this.name="ServerReceiptOcrError";
  }
}

let workerPromise:Promise<TesseractWorker>|null=null;
let workerRoot="";
let queueTail:Promise<void>=Promise.resolve();
let runtimeRootChecked="";

function asRecord(value:unknown):UnknownRecord|null{return value&&typeof value==="object"&&!Array.isArray(value)?value as UnknownRecord:null;}
function asArray(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function withTimeout<T>(promise:Promise<T>,timeoutMs:number,kind:TimeoutKind):Promise<T>{
  return new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new TimeoutError(kind)),timeoutMs);promise.then(value=>{clearTimeout(timer);resolve(value)},failure=>{clearTimeout(timer);reject(failure)})});
}
function assertRuntimeAssets(){
  const root=process.cwd();if(runtimeRootChecked===root)return;
  for(const runtimeFile of OCR_RUNTIME_FILES){if(!fs.existsSync(/* turbopackIgnore: true */runtimeFile))throw new ServerReceiptOcrError(`ocr_runtime_asset_missing:${path.relative(root,runtimeFile)}`,503,true);}
  runtimeRootChecked=root;
}
function invalidateWorker(){const current=workerPromise;workerPromise=null;workerRoot="";if(current)void current.then(worker=>worker.terminate()).catch(()=>undefined);}
async function getWorker(){
  const root=process.cwd();assertRuntimeAssets();
  if(!workerPromise||workerRoot!==root){
    workerRoot=root;
    workerPromise=createWorker("spa",1,{
      workerPath:path.join(root,"node_modules","tesseract.js","src","worker-script","node","index.js"),
      corePath:path.join(root,"node_modules","tesseract.js-core"),
      langPath:OCR_LANGUAGE_ROOT,
      cacheMethod:"none",
    }).catch(failure=>{workerPromise=null;workerRoot="";throw failure});
  }
  return workerPromise;
}
async function withExclusiveOcr<T>(task:()=>Promise<T>,queueTimeoutMs:number){
  const previous=queueTail.catch(()=>undefined);let release!:()=>void;const slot=new Promise<void>(resolve=>{release=resolve});queueTail=previous.then(()=>slot);
  try{await withTimeout(previous,queueTimeoutMs,"ocr_queue")}catch(failure){release();throw failure}
  try{return await task()}finally{release()}
}
function itemFromWord(value:unknown):ServerReceiptOcrItem|null{
  const word=asRecord(value);if(!word)return null;const text=String(word.text||"").trim();const box=asRecord(word.bbox);
  const x0=Number(box?.x0),y0=Number(box?.y0),x1=Number(box?.x1),y1=Number(box?.y1);
  if(!text||![x0,y0,x1,y1].every(Number.isFinite)||x1<=x0||y1<=y0)return null;
  const confidence=Number(word.confidence);return{text,score:Number.isFinite(confidence)?Math.max(0,Math.min(100,confidence)):50,poly:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]};
}
function wordsFromBlocks(blocks:unknown){
  const items:ServerReceiptOcrItem[]=[];
  for(const blockValue of asArray(blocks)){const block=asRecord(blockValue);for(const paragraphValue of asArray(block?.paragraphs)){const paragraph=asRecord(paragraphValue);for(const lineValue of asArray(paragraph?.lines)){const line=asRecord(lineValue);for(const wordValue of asArray(line?.words)){const item=itemFromWord(wordValue);if(item)items.push(item)}}}}
  return items;
}
function wordsFromTsv(tsv:unknown){
  if(typeof tsv!=="string")return[] as ServerReceiptOcrItem[];const items:ServerReceiptOcrItem[]=[];
  for(const line of tsv.split(/\r?\n/).slice(1)){const columns=line.split("\t");if(columns.length<12||columns[0]!=="5")continue;const left=Number(columns[6]),top=Number(columns[7]),width=Number(columns[8]),height=Number(columns[9]),confidence=Number(columns[10]);const text=columns.slice(11).join("\t").trim();if(!text||![left,top,width,height].every(Number.isFinite)||width<=0||height<=0)continue;items.push({text,score:Number.isFinite(confidence)?Math.max(0,Math.min(100,confidence)):50,poly:[[left,top],[left+width,top],[left+width,top+height],[left,top+height]]})}
  return items;
}
async function recognizeExclusive(bytes:Buffer,timeoutMs:number,queueTimeoutMs:number){
  return withExclusiveOcr(async()=>{try{
    const worker=await withTimeout(getWorker(),timeoutMs,"ocr_worker");
    // Mantiene una sola inferencia, pero permite a Tesseract corregir una
    // orientación residual si los metadatos EXIF o el origen no la aplanaron.
    return await withTimeout(worker.recognize(bytes,{rotateAuto:true},{text:true,blocks:true,tsv:true}),timeoutMs,"ocr_recognize");
  }catch(failure){if(failure instanceof TimeoutError||failure instanceof Error)invalidateWorker();throw failure}},queueTimeoutMs);
}

export async function recognizeServerReceiptImage(bytes:Buffer,options:ServerReceiptOcrOptions={}):Promise<ServerReceiptOcrResult>{
  const maxBytes=Math.max(1,options.maxBytes??DEFAULT_MAX_BYTES),maxSide=Math.max(1,options.maxSide??DEFAULT_MAX_SIDE),maxPixels=Math.max(1,options.maxPixels??DEFAULT_MAX_PIXELS),timeoutMs=Math.max(1,options.timeoutMs??DEFAULT_TIMEOUT_MS),queueTimeoutMs=Math.max(1,options.queueTimeoutMs??DEFAULT_QUEUE_TIMEOUT_MS);
  if(!bytes.byteLength||bytes.byteLength>maxBytes)throw new ServerReceiptOcrError("ocr_image_too_large",413,false);
  const image=readServerImageMetadata(bytes);if(!image)throw new ServerReceiptOcrError("ocr_image_format_unsupported",415,false);
  if(image.width>maxSide||image.height>maxSide||image.width*image.height>maxPixels)throw new ServerReceiptOcrError("ocr_image_dimensions_too_large",413,false);
  const started=Date.now();
  try{
    const recognition=await recognizeExclusive(bytes,timeoutMs,queueTimeoutMs);const data=asRecord(recognition?.data)||{};let items=wordsFromBlocks(data.blocks);if(!items.length)items=wordsFromTsv(data.tsv);const rawText=typeof data.text==="string"?data.text.trim():"";
    if(!items.length&&rawText){const confidence=Number(data.confidence);items=[{text:rawText,score:Number.isFinite(confidence)?Math.max(0,Math.min(100,confidence)):50,poly:[[0,0],[image.width,0],[image.width,image.height],[0,image.height]]}]}
    if(!items.length)throw new ServerReceiptOcrError("ocr_no_text",422,false);
    const totalMs=Date.now()-started;const scores=items.map(item=>item.score).filter(Number.isFinite);const confidence=scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:null;
    return{image:{width:image.width,height:image.height},items,rawText:rawText||items.map(item=>item.text).join("\n"),confidence,metrics:{detMs:0,recMs:totalMs,totalMs,detectedBoxes:items.length,recognizedCount:items.length},runtime:SERVER_RECEIPT_OCR_RUNTIME};
  }catch(failure){
    if(failure instanceof ServerReceiptOcrError)throw failure;
    if(failure instanceof TimeoutError&&failure.kind==="ocr_queue")throw new ServerReceiptOcrError("ocr_server_busy",503,true,failure);
    if(failure instanceof TimeoutError)throw new ServerReceiptOcrError("ocr_server_timeout",503,true,failure);
    throw new ServerReceiptOcrError("ocr_server_failed",503,true,failure);
  }
}