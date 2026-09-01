const MAX_PDF_BYTES=12*1024*1024;
const MAX_PDF_PAGES=16;
const MIN_USEFUL_TEXT=40;

export type ServerPdfTextResult={
  text:string;
  pagesRead:number;
  totalPages:number;
  truncated:boolean;
  useful:boolean;
};

export class ServerPdfTextError extends Error{
  constructor(readonly code:string,readonly retryable:boolean,cause?:unknown){super(code,{cause});this.name="ServerPdfTextError";}
}

export async function extractServerPdfText(bytes:Buffer):Promise<ServerPdfTextResult>{
  if(!bytes.byteLength||bytes.byteLength>MAX_PDF_BYTES)throw new ServerPdfTextError("drive_pdf_too_large",false);
  try{
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    const pdf=await task.promise;
    const totalPages=pdf.numPages;
    const pagesRead=Math.min(totalPages,MAX_PDF_PAGES);
    const chunks:string[]=[];
    try{
      for(let index=1;index<=pagesRead;index++){
        const page=await pdf.getPage(index);
        const content=await page.getTextContent();
        const text=content.items.map(item=>"str" in item?String(item.str||""):"").join(" ").replace(/\s+/g," ").trim();
        if(text)chunks.push(text);
      }
    }finally{
      await task.destroy().catch(()=>undefined);
    }
    const text=chunks.join("\n").trim();
    return{text,pagesRead,totalPages,truncated:totalPages>pagesRead,useful:text.replace(/\s/g,"").length>=MIN_USEFUL_TEXT};
  }catch(failure){
    if(failure instanceof ServerPdfTextError)throw failure;
    throw new ServerPdfTextError("drive_pdf_text_failed",true,failure);
  }
}
