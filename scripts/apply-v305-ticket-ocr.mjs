import fs from "node:fs";

function read(path){return fs.readFileSync(path,"utf8")}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,search,replacement,label){if(!source.includes(search))throw new Error(`No se encontró bloque: ${label}`);return source.replace(search,replacement)}
function replaceRegex(source,regex,replacement,label){if(!regex.test(source))throw new Error(`No se encontró patrón: ${label}`);return source.replace(regex,replacement)}

// Versionado real 3.0.5.
{
  const pkg=JSON.parse(read("package.json"));pkg.version="3.0.5";write("package.json",JSON.stringify(pkg,null,2)+"\n");
  const lock=JSON.parse(read("package-lock.json"));lock.version="3.0.5";if(lock.packages?.[""])lock.packages[""].version="3.0.5";write("package-lock.json",JSON.stringify(lock,null,2)+"\n");
  let appVersion=read("lib/app-version.ts");appVersion=appVersion.replace('APP_VERSION = "3.0.0"','APP_VERSION = "3.0.5"');write("lib/app-version.ts",appVersion);
  let readme=read("README.md");readme=readme.replace("# Financial App 3.0.0","# Financial App 3.0.5");write("README.md",readme);
}

// OCR 3.0.5: TSV con confianza/posición + binarización adaptativa + tolerancia a importes con separador perdido.
{
  const path="lib/document/ticket-ocr.ts";let s=read(path);
  s=replaceOnce(s,
`type Recognition = { data?: { text?: string; confidence?: number } };
type OcrWorker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement) => Promise<Recognition>;
};`,
`type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type OcrWorker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>) => Promise<Recognition>;
};`,"worker TSV type");

  s=replaceOnce(s,
`export function preserveOcrLayout(text: string) {
  const lines=text.replace(/\\r/g,"").split("\\n").map(line=>line.replace(/\\t/g,"    ").replace(/[|¦]/g,"I").replace(/\\s+$/g,""));
  const compact:string[]=[];
  let previousBlank=false;
  for(const line of lines){
    const blank=!line.trim();
    if(blank&&previousBlank) continue;
    compact.push(line);
    previousBlank=blank;
  }
  return compact.join("\\n").trim();
}
`,
`export function preserveOcrLayout(text: string) {
  const lines=text.replace(/\\r/g,"").split("\\n").map(line=>line.replace(/\\t/g,"    ").replace(/[|¦]/g,"I").replace(/\\s+$/g,""));
  const compact:string[]=[];
  let previousBlank=false;
  for(const line of lines){
    const blank=!line.trim();
    if(blank&&previousBlank) continue;
    compact.push(line);
    previousBlank=blank;
  }
  return compact.join("\\n").trim();
}

function repairReceiptLine(value:string){
  return value
    .replace(/(\\d)\\s*[:;]\\s*(\\d{2})(?=\\b)/g,"$1.$2")
    .replace(/(\\bTOTAL\\b[^\\d]{0,12})(\\d{1,4})\\s+(\\d{2})(?=\\s*(?:€|EUR)\\b)/gi,"$1$2,$3")
    .replace(/\\s+$/g,"");
}

type TsvWord={text:string;conf:number;left:number;top:number;width:number;height:number;key:string};
export function reconstructTsvReceipt(tsv:string){
  if(!tsv.trim())return null;
  const words:TsvWord[]=[];
  for(const row of tsv.replace(/\\r/g,"").split("\\n").slice(1)){
    const cols=row.split("\\t");if(cols.length<12||Number(cols[0])!==5)continue;
    const text=cols.slice(11).join("\\t").trim();const conf=Number(cols[10]);
    if(!text||!Number.isFinite(conf)||conf<28)continue;
    const visible=text.replace(/\\s/g,"");const useful=(visible.match(/[\\p{L}\\d€%.,:()/-]/gu)||[]).length;
    if(visible.length&&useful/visible.length<.55)continue;
    words.push({text,conf,left:Number(cols[6]),top:Number(cols[7]),width:Number(cols[8]),height:Number(cols[9]),key:`${cols[2]}:${cols[3]}:${cols[4]}`});
  }
  if(!words.length)return null;
  const groups=new Map<string,TsvWord[]>();for(const word of words){const list=groups.get(word.key)||[];list.push(word);groups.set(word.key,list)}
  const lines=[...groups.values()].map(items=>{
    items.sort((a,b)=>a.left-b.left);const mean=items.reduce((sum,item)=>sum+item.conf,0)/items.length;const plain=repairReceiptLine(items.map(item=>item.text).join(" "));
    const strong=/\\b(total|subtotal|iva|base|fecha|hora|mesa|precio|importe|pendiente|tarjeta|efectivo)\\b/i.test(plain)||/\\b(?:19|20)\\d{2}[-/.]\\d{1,2}[-/.]\\d{1,2}\\b/.test(plain)||/\\d+[.,:]\\d{2}/.test(plain);
    if(mean<38&&!strong)return null;
    const widths=items.map(item=>item.width/Math.max(1,item.text.length)).filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);const charWidth=Math.max(5,widths[Math.floor(widths.length/2)]||9);const minLeft=items[0].left;
    let layout="";for(const item of items){const col=Math.max(0,Math.round((item.left-minLeft)/charWidth));if(layout.length<col)layout+=" ".repeat(col-layout.length);else if(layout&& !layout.endsWith(" "))layout+=" ";layout+=item.text;}
    return {top:Math.min(...items.map(item=>item.top)),mean,plain,layout:repairReceiptLine(layout)};
  }).filter((line):line is {top:number;mean:number;plain:string;layout:string}=>Boolean(line)).sort((a,b)=>a.top-b.top);
  if(!lines.length)return null;
  return {text:lines.map(line=>line.plain).join("\\n"),layoutText:lines.map(line=>line.layout).join("\\n")};
}
`,"TSV receipt reconstruction");

  s=replaceRegex(s,/function extractAmounts\(line: string\) \{[\s\S]*?\n\}/,
`function extractAmounts(line: string) {
  const repaired=line
    .replace(/(\\d)\\s*[:;]\\s*(\\d{2})(?=\\b)/g,"$1.$2")
    .replace(/(\\d{1,5})\\s+(\\d{2})(?=\\s*(?:€|EUR)\\b)/gi,"$1,$2");
  const matches = repaired.match(/-?\\d{1,5}(?:[.\\s]\\d{3})*(?:,\\d{2}|\\.\\d{2})(?:\\s*(?:€|EUR))?/gi) || [];
  return matches.map(parseEuroValue).filter((value): value is number => value !== null && Math.abs(value) < 1_000_000);
}`,"amount OCR repair");

  s=replaceOnce(s,
`    const binary=document.createElement("canvas");binary.width=width;binary.height=height;binary.getContext("2d")?.putImageData(new ImageData(binaryPixels,width,height),0,0);
    return {original,enhanced,binary,width,height,threshold,cropped:Boolean(bounds)};`,
`    const binary=document.createElement("canvas");binary.width=width;binary.height=height;binary.getContext("2d")?.putImageData(new ImageData(binaryPixels,width,height),0,0);
    const adaptivePixels=new Uint8ClampedArray(grayscale);const blockSize=Math.max(64,Math.round(Math.min(width,height)/18));
    for(let by=0;by<height;by+=blockSize){for(let bx=0;bx<width;bx+=blockSize){const ex=Math.min(width,bx+blockSize),ey=Math.min(height,by+blockSize);let sum=0,count=0;for(let y=by;y<ey;y+=2){for(let x=bx;x<ex;x+=2){sum+=grayscale[(y*width+x)*4];count+=1;}}const local=clamp(Math.round(sum/Math.max(1,count))-18,118,220);for(let y=by;y<ey;y++){for(let x=bx;x<ex;x++){const o=(y*width+x)*4;const value=grayscale[o]<local?0:255;adaptivePixels[o]=value;adaptivePixels[o+1]=value;adaptivePixels[o+2]=value;adaptivePixels[o+3]=255;}}}}
    const adaptive=document.createElement("canvas");adaptive.width=width;adaptive.height=height;adaptive.getContext("2d")?.putImageData(new ImageData(adaptivePixels,width,height),0,0);
    return {original,enhanced,binary,adaptive,width,height,threshold,cropped:Boolean(bounds)};`,"adaptive receipt image");

  s=replaceRegex(s,/async function recognize\(worker: OcrWorker, input: File \| HTMLCanvasElement, psm: string\) \{[\s\S]*?\n\}/,
`async function recognize(worker: OcrWorker, input: File | HTMLCanvasElement, psm: string) {
  await worker.setParameters?.({tessedit_pageseg_mode:psm,preserve_interword_spaces:"1",user_defined_dpi:"300"});
  const result=await worker.recognize(input,{}, {text:true,tsv:true});const raw=String(result.data?.text||"");const structured=reconstructTsvReceipt(String(result.data?.tsv||""));
  return {text:structured?.text||normalizeOcrText(raw),layoutText:structured?.layoutText||preserveOcrLayout(raw),confidence:Number.isFinite(result.data?.confidence)?Number(result.data?.confidence):null};
}`,"recognize TSV");

  s=replaceRegex(s,/export async function recognizeTicketImage\([\s\S]*?\n\}/,
`export async function recognizeTicketImage(
  file: File,
  worker: OcrWorker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const passes:Array<{variant:string;text:string;layoutText:string;confidence:number|null;score:number}>=[];
  let variants:Awaited<ReturnType<typeof imageVariants>>|null=null;
  try{
    onProgress(.06,"Detectando el papel del ticket");variants=await imageVariants(file);
    onProgress(.22,"Escaneando ticket · contraste adaptativo");const adaptive=await recognize(worker,variants.adaptive,"6");passes.push({variant:"adaptive_block_tsv",...adaptive,score:candidateScore(adaptive.text,adaptive.confidence,hint)});
    onProgress(.48,"Escaneando ticket · columnas y precios");const column=await recognize(worker,variants.enhanced,"4");passes.push({variant:"enhanced_column_tsv",...column,score:candidateScore(column.text,column.confidence,hint)});
    let current=passes.reduce((a,b)=>b.score>a.score?b:a);let meta=inferDocumentMetadata(current.text,hint);
    const looksGood=(current.confidence??0)>=67&&Boolean(meta.documentDate)&&meta.amount!==null&&Boolean(meta.merchant)&&current.text.length>=90;
    if(!looksGood){onProgress(.69,"Escaneando ticket · bloque completo");const block=await recognize(worker,variants.enhanced,"6");passes.push({variant:"enhanced_block_tsv",...block,score:candidateScore(block.text,block.confidence,hint)});current=passes.reduce((a,b)=>b.score>a.score?b:a);meta=inferDocumentMetadata(current.text,hint);}
    if(!meta.documentDate||meta.amount===null||!meta.merchant){onProgress(.84,"Afinando caracteres dudosos");const sparse=await recognize(worker,variants.binary,"11");passes.push({variant:"binary_sparse_tsv",...sparse,score:candidateScore(sparse.text,sparse.confidence,hint)});}
  }catch{onProgress(.62,"Leyendo imagen original");}
  if(!passes.length){const original=await recognize(worker,file,"6");passes.push({variant:"original_block_tsv",...original,score:candidateScore(original.text,original.confidence,hint)});}
  const best=passes.reduce((winner,item)=>item.score>winner.score?item:winner,passes[0]);
  onProgress(.96,"Validando comercio, fecha e importe");
  return {text:best.text,layoutText:best.layoutText,confidence:best.confidence,method:\`image_ocr_receipt_v305:\${best.variant}\`,passes:passes.map(({variant,confidence,score})=>({variant,confidence,score:Math.round(score*10)/10}))};
}`,"recognizeTicketImage v305");
  write(path,s);
}

// Test del fallo real observado: TOTAL con separador perdido y ruido OCR.
{
  const path="scripts/ticket-ocr-v302-tests.ts";let s=read(path);
  s=s.replace('import { inferDocumentMetadata, normalizeOcrText } from "../lib/document/ticket-ocr";','import { inferDocumentMetadata, normalizeOcrText, reconstructTsvReceipt } from "../lib/document/ticket-ocr";');
  s=s.replace('console.log("ticket-ocr-v302-tests OK");',`const noisyReal = inferDocumentMetadata(\`\nMI RESTAURANTE\nHora 2026-07-11 18:41:59\nMesa TERRAZA-13\nBase imponible 40.55\nIVA (10%) 4.05\nTOTAL: 44 60 EUR\nPENDIENTE\n\`, "receipt");
assert.equal(noisyReal.documentDate, "2026-07-11");
assert.equal(noisyReal.amount, 44.6);
assert.equal(noisyReal.merchant, "MI RESTAURANTE");

const tsv=[
  "level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext",
  "5\\t1\\t1\\t1\\t1\\t1\\t100\\t20\\t80\\t25\\t91\\tMI",
  "5\\t1\\t1\\t1\\t1\\t2\\t190\\t20\\t180\\t25\\t94\\tRESTAURANTE",
  "5\\t1\\t1\\t1\\t2\\t1\\t90\\t60\\t40\\t25\\t8\\tZZ",
  "5\\t1\\t1\\t1\\t3\\t1\\t100\\t100\\t85\\t25\\t93\\tTOTAL:",
  "5\\t1\\t1\\t1\\t3\\t2\\t260\\t100\\t50\\t25\\t90\\t44",
  "5\\t1\\t1\\t1\\t3\\t3\\t325\\t100\\t40\\t25\\t89\\t60",
  "5\\t1\\t1\\t1\\t3\\t4\\t380\\t100\\t55\\t25\\t95\\tEUR",
].join("\\n");
const structured=reconstructTsvReceipt(tsv);assert.ok(structured);assert.ok(structured.text.includes("MI RESTAURANTE"));assert.ok(structured.text.includes("44,60"));assert.ok(!structured.text.includes("ZZ"));
console.log("ticket-ocr-v302-tests OK");`);
  write(path,s);
}

// Refuerza el audit del pipeline.
{
  const path="scripts/audit-ticket-ocr-v302.mjs";let s=read(path);
  s=s.replace('must(engine.includes("candidateScore"), "Debe seleccionarse la mejor lectura por calidad y metadatos");',`must(engine.includes("candidateScore"), "Debe seleccionarse la mejor lectura por calidad y metadatos");
must(engine.includes("reconstructTsvReceipt") && engine.includes("tsv:true"), "El OCR debe usar confianza y posición TSV, no sólo texto plano");
must(engine.includes("adaptivePixels") && engine.includes("adaptive_block_tsv"), "Debe existir binarización adaptativa para tickets fotografiados");`);
  write(path,s);
}

console.log("3.0.5 OCR/version patch applied");
