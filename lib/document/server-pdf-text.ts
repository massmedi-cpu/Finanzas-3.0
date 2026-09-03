import { recognizeServerReceiptImage,ServerReceiptOcrError } from "./server-receipt-ocr";

const MAX_PDF_BYTES=12*1024*1024;
const MAX_PDF_PAGES=16;
const MAX_VISUAL_OCR_PAGES=3;
const MIN_USEFUL_TEXT=40;
const MIN_USEFUL_NATIVE_TEXT=MIN_USEFUL_TEXT;
const MIN_USEFUL_OCR_TEXT=8;
const MAX_RENDER_SIDE=2800;
const MAX_RENDER_SCALE=2.5;

export type ServerPdfPageSource="text"|"ocr"|"missing";
export type ServerPdfPageResult={
  pageNumber:number;
  source:ServerPdfPageSource;
  text:string;
  textCharacters:number;
  confidence:number|null;
  reason:string|null;
};
export type ServerPdfSourceMode="pdf_text"|"pdf_hybrid"|"pdf_ocr"|"pdf_incomplete";
export type ServerPdfTextResult={
  text:string;
  pagesRead:number;
  totalPages:number;
  truncated:boolean;
  useful:boolean;
  completeCoverage:boolean;
  sourceMode:ServerPdfSourceMode;
  nativePages:number[];
  ocrPages:number[];
  missingPages:number[];
  confidence:number|null;
  pages:ServerPdfPageResult[];
};

type PdfCanvasFactory={
  create:(width:number,height:number)=>{canvas:{toBuffer:(mimeType?:string)=>Buffer|Uint8Array};context:unknown};
  destroy?:(target:unknown)=>void;
};
type PdfDocumentWithCanvas={canvasFactory?:PdfCanvasFactory};

export class ServerPdfTextError extends Error{
  constructor(readonly code:string,readonly retryable:boolean,cause?:unknown){super(code,{cause});this.name="ServerPdfTextError";}
}

function meaningfulCharacters(value:string){return(value.match(/[\p{L}\d]/gu)||[]).length;}
export function isUsefulNativePdfText(value:string){return meaningfulCharacters(value)>=MIN_USEFUL_NATIVE_TEXT;}
export function isUsefulPdfOcrText(value:string){return meaningfulCharacters(value)>=MIN_USEFUL_OCR_TEXT;}
export function serverPdfSourceMode(nativePages:number[],ocrPages:number[],missingPages:number[]):ServerPdfSourceMode{
  if(missingPages.length)return"pdf_incomplete";
  if(ocrPages.length&&nativePages.length)return"pdf_hybrid";
  if(ocrPages.length)return"pdf_ocr";
  return"pdf_text";
}
function textFromContent(content:{items:unknown[]}){
  const parts:string[]=[];
  for(const item of content.items){
    if(!item||typeof item!=="object"||!("str" in item))continue;
    const value=String((item as{str?:unknown}).str||"").trim();
    if(value)parts.push(value);
    if("hasEOL" in item&&(item as{hasEOL?:unknown}).hasEOL===true)parts.push("\n");
  }
  return parts.join(" ").replace(/[ \t]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
async function renderPagePng(pdf:PdfDocumentWithCanvas,page:{getViewport:(options:{scale:number})=>{width:number;height:number};render:(options:Record<string,unknown>)=>{promise:Promise<unknown>}},pageNumber:number){
  const canvasFactory=pdf.canvasFactory;
  if(!canvasFactory?.create)throw new ServerPdfTextError("drive_pdf_canvas_unavailable",true);
  const baseViewport=page.getViewport({scale:1});
  const longest=Math.max(baseViewport.width,baseViewport.height,1);
  const scale=Math.max(.5,Math.min(MAX_RENDER_SCALE,MAX_RENDER_SIDE/longest));
  const viewport=page.getViewport({scale});
  const rendered=canvasFactory.create(Math.max(1,Math.ceil(viewport.width)),Math.max(1,Math.ceil(viewport.height)));
  try{
    await page.render({canvasContext:rendered.context,viewport,canvasFactory}).promise;
    const png=Buffer.from(rendered.canvas.toBuffer("image/png"));
    if(!png.byteLength)throw new ServerPdfTextError(`drive_pdf_page_${pageNumber}_render_empty`,true);
    return png;
  }catch(failure){
    if(failure instanceof ServerPdfTextError)throw failure;
    throw new ServerPdfTextError(`drive_pdf_page_${pageNumber}_render_failed`,true,failure);
  }finally{
    try{canvasFactory.destroy?.(rendered);}catch{}
  }
}

export async function extractServerPdfText(bytes:Buffer):Promise<ServerPdfTextResult>{
  if(!bytes.byteLength||bytes.byteLength>MAX_PDF_BYTES)throw new ServerPdfTextError("drive_pdf_too_large",false);
  try{
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    const pdf=await task.promise;
    const totalPages=pdf.numPages;
    const pagesRead=Math.min(totalPages,MAX_PDF_PAGES);
    const pages:ServerPdfPageResult[]=[];
    let visualOcrCount=0;
    try{
      for(let index=1;index<=pagesRead;index++){
        const page=await pdf.getPage(index);
        try{
          const content=await page.getTextContent();
          const nativeText=textFromContent(content as{items:unknown[]});
          if(isUsefulNativePdfText(nativeText)){
            pages.push({pageNumber:index,source:"text",text:nativeText,textCharacters:meaningfulCharacters(nativeText),confidence:null,reason:null});
            continue;
          }
          if(visualOcrCount>=MAX_VISUAL_OCR_PAGES){
            pages.push({pageNumber:index,source:"missing",text:nativeText,textCharacters:meaningfulCharacters(nativeText),confidence:null,reason:"visual_ocr_page_budget"});
            continue;
          }
          visualOcrCount++;
          try{
            const png=await renderPagePng(pdf as unknown as PdfDocumentWithCanvas,page as unknown as Parameters<typeof renderPagePng>[1],index);
            const recognized=await recognizeServerReceiptImage(png,{maxBytes:12*1024*1024,maxSide:4000,maxPixels:20_000_000,timeoutMs:12_000,queueTimeoutMs:2_500});
            const ocrText=String(recognized.rawText||"").trim();
            if(isUsefulPdfOcrText(ocrText))pages.push({pageNumber:index,source:"ocr",text:ocrText,textCharacters:meaningfulCharacters(ocrText),confidence:recognized.confidence,reason:null});
            else pages.push({pageNumber:index,source:"missing",text:ocrText||nativeText,textCharacters:meaningfulCharacters(ocrText||nativeText),confidence:recognized.confidence,reason:"visual_ocr_text_insufficient"});
          }catch(failure){
            if(failure instanceof ServerReceiptOcrError&&failure.retryable)throw new ServerPdfTextError(`drive_pdf_page_${index}_${failure.code}`,true,failure);
            if(failure instanceof ServerPdfTextError)throw failure;
            const reason=failure instanceof ServerReceiptOcrError?failure.code:"visual_ocr_failed";
            pages.push({pageNumber:index,source:"missing",text:nativeText,textCharacters:meaningfulCharacters(nativeText),confidence:null,reason});
          }
        }finally{
          try{page.cleanup();}catch{}
        }
      }
    }finally{
      await task.destroy().catch(()=>undefined);
    }
    const nativePages=pages.filter(page=>page.source==="text").map(page=>page.pageNumber);
    const ocrPages=pages.filter(page=>page.source==="ocr").map(page=>page.pageNumber);
    const missingPages=pages.filter(page=>page.source==="missing").map(page=>page.pageNumber);
    const truncated=totalPages>pagesRead;
    const completeCoverage=!truncated&&pages.length===totalPages&&!missingPages.length;
    const text=pages.map(page=>page.text.trim()).filter(Boolean).join("\n\n").trim();
    const scores=pages.map(page=>page.confidence).filter((value):value is number=>Number.isFinite(value));
    const confidence=scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:null;
    const sourceMode=serverPdfSourceMode(nativePages,ocrPages,missingPages);
    return{text,pagesRead,totalPages,truncated,useful:completeCoverage&&isUsefulPdfOcrText(text),completeCoverage,sourceMode,nativePages,ocrPages,missingPages,confidence,pages};
  }catch(failure){
    if(failure instanceof ServerPdfTextError)throw failure;
    throw new ServerPdfTextError("drive_pdf_text_failed",true,failure);
  }
}