import { inferDocumentMetadata, type DocumentMetadata, type DocumentTypeHint } from "./ticket-ocr";
import { recognizeCanonicalReceiptBytes } from "./server-canonical-receipt";

const MAX_PDF_BYTES=12*1024*1024;
const MAX_PDF_PAGES=16;
const MAX_OCR_PAGES=2;
const MIN_USEFUL_TEXT=40;
const RENDER_SCALE=1.8;

type CanvasAndContext={
  canvas:{width:number;height:number;toBuffer:(mime?:string)=>Buffer};
  context:unknown;
};
type CanvasFactory={
  create:(width:number,height:number)=>CanvasAndContext;
  destroy:(canvas:CanvasAndContext)=>void;
};

export type ServerPdfPageEvidence={
  page:number;
  source:"text"|"ocr"|"unread";
  textCharacters:number;
  confidence:number|null;
  method:string;
  validationStatus:string|null;
};
export type ServerPdfDocumentResult={
  text:string;
  metadata:DocumentMetadata;
  pagesRead:number;
  totalPages:number;
  truncated:boolean;
  scannedPages:number[];
  ocrPages:number[];
  unreadPages:number[];
  confidence:number|null;
  financiallyValid:boolean;
  method:"drive_auto_pdf_text_v1"|"drive_auto_pdf_hybrid_canonical_v2"|"drive_auto_pdf_scan_canonical_v2";
  pageEvidence:ServerPdfPageEvidence[];
};

export class ServerPdfDocumentError extends Error{
  constructor(readonly code:string,readonly retryable:boolean,cause?:unknown){super(code,{cause});this.name="ServerPdfDocumentError";}
}

function useful(text:string){return text.replace(/\s/g,"").length>=MIN_USEFUL_TEXT;}

export async function processServerPdfDocument(bytes:Buffer,hint:DocumentTypeHint=null):Promise<ServerPdfDocumentResult>{
  if(!bytes.byteLength||bytes.byteLength>MAX_PDF_BYTES)throw new ServerPdfDocumentError("drive_pdf_too_large",false);
  try{
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    const pdf=await task.promise;
    const totalPages=pdf.numPages;
    const pagesRead=Math.min(totalPages,MAX_PDF_PAGES);
    const canvasFactory=(pdf as unknown as {canvasFactory:CanvasFactory}).canvasFactory;
    if(!canvasFactory||typeof canvasFactory.create!=="function"||typeof canvasFactory.destroy!=="function")throw new ServerPdfDocumentError("drive_pdf_canvas_unavailable",true);
    const chunks:string[]=[];
    const scannedPages:number[]=[];
    const ocrPages:number[]=[];
    const unreadPages:number[]=[];
    const confidences:number[]=[];
    const pageEvidence:ServerPdfPageEvidence[]=[];
    let allOcrFinanciallyValid=true;
    try{
      for(let index=1;index<=pagesRead;index++){
        const page=await pdf.getPage(index);
        const content=await page.getTextContent();
        const pageText=content.items.map(item=>"str" in item?String(item.str||""):"").join(" ").replace(/\s+/g," ").trim();
        if(useful(pageText)){
          chunks.push(pageText);
          pageEvidence.push({page:index,source:"text",textCharacters:pageText.length,confidence:null,method:"pdf_text",validationStatus:null});
          page.cleanup();
          continue;
        }
        scannedPages.push(index);
        if(ocrPages.length>=MAX_OCR_PAGES){
          unreadPages.push(index);
          pageEvidence.push({page:index,source:"unread",textCharacters:0,confidence:null,method:"ocr_budget_deferred",validationStatus:null});
          page.cleanup();
          continue;
        }
        const viewport=page.getViewport({scale:RENDER_SCALE});
        const surface=canvasFactory.create(viewport.width,viewport.height);
        try{
          await page.render({canvasContext:surface.context as never,viewport}).promise;
          const png=surface.canvas.toBuffer("image/png");
          const recognized=await recognizeCanonicalReceiptBytes(png,{mimeType:"image/png",hint,maxBytes:MAX_PDF_BYTES,timeoutMs:18_000,queueTimeoutMs:3_000});
          const text=recognized.text.trim();
          if(text)chunks.push(text);
          ocrPages.push(index);
          if(Number.isFinite(recognized.confidence))confidences.push(Number(recognized.confidence));
          const validationStatus=recognized.validation?.status||null;
          if(validationStatus!=="complete")allOcrFinanciallyValid=false;
          pageEvidence.push({page:index,source:"ocr",textCharacters:text.length,confidence:recognized.confidence,method:recognized.method,validationStatus});
        }finally{
          canvasFactory.destroy(surface);
          page.cleanup();
        }
      }
    }finally{
      await task.destroy().catch(()=>undefined);
    }
    const text=chunks.join("\n\n").trim();
    if(!text)throw new ServerPdfDocumentError("drive_pdf_no_text",false);
    const metadata=inferDocumentMetadata(text,hint);
    const confidence=confidences.length?confidences.reduce((sum,value)=>sum+value,0)/confidences.length:null;
    const method=scannedPages.length===0?"drive_auto_pdf_text_v1":scannedPages.length===ocrPages.length?"drive_auto_pdf_scan_canonical_v2":"drive_auto_pdf_hybrid_canonical_v2";
    return{text,metadata,pagesRead,totalPages,truncated:totalPages>pagesRead,scannedPages,ocrPages,unreadPages,confidence,financiallyValid:unreadPages.length===0&&allOcrFinanciallyValid,method,pageEvidence};
  }catch(failure){
    if(failure instanceof ServerPdfDocumentError)throw failure;
    throw new ServerPdfDocumentError("drive_pdf_processing_failed",true,failure);
  }
}
