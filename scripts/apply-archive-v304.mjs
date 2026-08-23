import fs from "node:fs";

function read(path){return fs.readFileSync(path,"utf8")}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,search,replacement,label){
  if(!source.includes(search)) throw new Error(`No se encontró bloque: ${label}`);
  return source.replace(search,replacement);
}
function replaceRegex(source,regex,replacement,label){
  if(!regex.test(source)) throw new Error(`No se encontró patrón: ${label}`);
  return source.replace(regex,replacement);
}

// OCR: recorte automático del papel, varias segmentaciones y texto de layout preservado.
{
  const path="lib/document/ticket-ocr.ts";
  let s=read(path);
  s=replaceRegex(s,/export type ImageOcrResult = \{[\s\S]*?\n\};/,`export type ImageOcrResult = {
  text: string;
  layoutText: string;
  confidence: number | null;
  method: string;
  passes: Array<{ variant: string; confidence: number | null; score: number }>;
};`,"ImageOcrResult");

  s=replaceOnce(s,`export function normalizeOcrText(text: string) {
  return text
    .split(/\\r?\\n/)
    .map(cleanLine)
    .filter(usefulLine)
    .join("\\n")
    .trim();
}
`,`export function normalizeOcrText(text: string) {
  return text
    .split(/\\r?\\n/)
    .map(cleanLine)
    .filter(usefulLine)
    .join("\\n")
    .trim();
}

export function preserveOcrLayout(text: string) {
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
`,"preserve OCR layout");

  s=replaceRegex(s,/async function imageVariants\(file: File\) \{[\s\S]*?\n\}\n\nfunction candidateScore/,`function detectReceiptBounds(data: ImageData, width: number, height: number) {
  const step=Math.max(4,Math.floor(Math.max(width,height)/650));
  const rows=Math.ceil(height/step);const cols=Math.ceil(width/step);
  const rowHits=new Uint32Array(rows);const colHits=new Uint32Array(cols);
  for(let gy=0;gy<rows;gy+=1){
    const y=Math.min(height-1,gy*step);
    for(let gx=0;gx<cols;gx+=1){
      const x=Math.min(width-1,gx*step);const offset=(y*width+x)*4;
      const r=data.data[offset],g=data.data[offset+1],b=data.data[offset+2];
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b);const luma=r*.2126+g*.7152+b*.0722;
      const paper=luma>=142&&(hi-lo)<=72&&g>=r-38&&b>=r-38;
      if(paper){rowHits[gy]+=1;colHits[gx]+=1;}
    }
  }
  const rowMin=Math.max(4,Math.round(cols*.16));const colMin=Math.max(4,Math.round(rows*.22));
  let top=0,bottom=rows-1,left=0,right=cols-1;
  while(top<rows&&rowHits[top]<rowMin)top+=1;while(bottom>=0&&rowHits[bottom]<rowMin)bottom-=1;
  while(left<cols&&colHits[left]<colMin)left+=1;while(right>=0&&colHits[right]<colMin)right-=1;
  if(top>=bottom||left>=right)return null;
  let x=left*step,y=top*step,w=(right-left+1)*step,h=(bottom-top+1)*step;
  if(w<width*.38||h<height*.42)return null;
  const mx=Math.round(w*.045),my=Math.round(h*.035);
  x=Math.max(0,x-mx);y=Math.max(0,y-my);w=Math.min(width-x,w+mx*2);h=Math.min(height-y,h+my*2);
  return {x,y,w,h};
}

async function imageVariants(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.max(1, 2100 / Math.max(1, bitmap.width));
    if (bitmap.width * scale > 2800) scale = 2800 / bitmap.width;
    if (bitmap.height * scale > 5200) scale = Math.min(scale, 5200 / bitmap.height);
    const fullWidth = Math.max(1, Math.round(bitmap.width * scale));
    const fullHeight = Math.max(1, Math.round(bitmap.height * scale));
    const base = document.createElement("canvas");base.width=fullWidth;base.height=fullHeight;
    const baseContext=base.getContext("2d",{willReadFrequently:true});if(!baseContext)throw new Error("Canvas no disponible");
    baseContext.fillStyle="#fff";baseContext.fillRect(0,0,fullWidth,fullHeight);baseContext.imageSmoothingEnabled=true;baseContext.imageSmoothingQuality="high";baseContext.drawImage(bitmap,0,0,fullWidth,fullHeight);
    const fullData=baseContext.getImageData(0,0,fullWidth,fullHeight);const bounds=detectReceiptBounds(fullData,fullWidth,fullHeight);
    const original=document.createElement("canvas");
    if(bounds){original.width=bounds.w;original.height=bounds.h;original.getContext("2d")?.drawImage(base,bounds.x,bounds.y,bounds.w,bounds.h,0,0,bounds.w,bounds.h)}
    else{original.width=fullWidth;original.height=fullHeight;original.getContext("2d")?.drawImage(base,0,0)}
    const width=original.width,height=original.height;const context=original.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Canvas no disponible");
    const source=context.getImageData(0,0,width,height);const grayscale=new Uint8ClampedArray(source.data.length);const histogram=new Uint32Array(256);const pixels=width*height;
    for(let offset=0;offset<source.data.length;offset+=4){const value=Math.round(source.data[offset]*.2126+source.data[offset+1]*.7152+source.data[offset+2]*.0722);histogram[value]+=1;}
    const low=percentile(histogram,pixels,.01);const high=Math.max(low+24,percentile(histogram,pixels,.99));const stretchedHistogram=new Uint32Array(256);
    for(let offset=0;offset<source.data.length;offset+=4){const raw=Math.round(source.data[offset]*.2126+source.data[offset+1]*.7152+source.data[offset+2]*.0722);const value=clamp(Math.round(((raw-low)*255)/(high-low)),0,255);stretchedHistogram[value]+=1;grayscale[offset]=value;grayscale[offset+1]=value;grayscale[offset+2]=value;grayscale[offset+3]=255;}
    const enhanced=document.createElement("canvas");enhanced.width=width;enhanced.height=height;enhanced.getContext("2d")?.putImageData(new ImageData(grayscale,width,height),0,0);
    const threshold=otsuThreshold(stretchedHistogram,pixels);const binaryPixels=new Uint8ClampedArray(grayscale);
    for(let offset=0;offset<binaryPixels.length;offset+=4){const value=binaryPixels[offset]<threshold?0:255;binaryPixels[offset]=value;binaryPixels[offset+1]=value;binaryPixels[offset+2]=value;}
    const binary=document.createElement("canvas");binary.width=width;binary.height=height;binary.getContext("2d")?.putImageData(new ImageData(binaryPixels,width,height),0,0);
    return {original,enhanced,binary,width,height,threshold,cropped:Boolean(bounds)};
  } finally { bitmap.close(); }
}

function candidateScore`,"image variants with receipt crop");

  s=replaceRegex(s,/async function recognize\(worker: OcrWorker, input: File \| HTMLCanvasElement, psm: string\) \{[\s\S]*?\n\}/,`async function recognize(worker: OcrWorker, input: File | HTMLCanvasElement, psm: string) {
  await worker.setParameters?.({tessedit_pageseg_mode:psm,preserve_interword_spaces:"1",user_defined_dpi:"300"});
  const result=await worker.recognize(input);const raw=String(result.data?.text||"");
  return {text:normalizeOcrText(raw),layoutText:preserveOcrLayout(raw),confidence:Number.isFinite(result.data?.confidence)?Number(result.data?.confidence):null};
}`,"recognize with layout");

  s=replaceRegex(s,/export async function recognizeTicketImage\([\s\S]*?\n\}/,`export async function recognizeTicketImage(
  file: File,
  worker: OcrWorker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const passes:Array<{variant:string;text:string;layoutText:string;confidence:number|null;score:number}>=[];
  let variants:Awaited<ReturnType<typeof imageVariants>>|null=null;
  try{
    onProgress(.08,"Detectando y recortando el ticket");variants=await imageVariants(file);
    onProgress(.27,"Leyendo ticket · estructura completa");const block=await recognize(worker,variants.enhanced,"6");passes.push({variant:"enhanced_block",...block,score:candidateScore(block.text,block.confidence,hint)});
    onProgress(.55,"Leyendo ticket · columnas y precios");const column=await recognize(worker,variants.enhanced,"4");passes.push({variant:"enhanced_column",...column,score:candidateScore(column.text,column.confidence,hint)});
    const current=passes.reduce((a,b)=>b.score>a.score?b:a);const meta=inferDocumentMetadata(current.text,hint);
    const looksGood=(current.confidence??0)>=70&&Boolean(meta.documentDate)&&meta.amount!==null&&Boolean(meta.merchant)&&current.text.length>=100;
    if(!looksGood){onProgress(.75,"Afinando caracteres del ticket");const sparse=await recognize(worker,variants.binary,"11");passes.push({variant:"binary_sparse",...sparse,score:candidateScore(sparse.text,sparse.confidence,hint)});}
  }catch{onProgress(.62,"Leyendo imagen original");}
  if(!passes.length){const original=await recognize(worker,file,"6");passes.push({variant:"original_block",...original,score:candidateScore(original.text,original.confidence,hint)});}
  const best=passes.reduce((winner,item)=>item.score>winner.score?item:winner,passes[0]);
  onProgress(.96,"Interpretando fecha, comercio e importe");
  return {text:best.text,layoutText:best.layoutText,confidence:best.confidence,method:\`image_ocr_receipt:\${best.variant}\`,passes:passes.map(({variant,confidence,score})=>({variant,confidence,score:Math.round(score*10)/10}))};
}`,"recognizeTicketImage");
  write(path,s);
}

// API de listado: permite pedir también los archivados.
{
  const path="app/api/archive/route.ts";let s=read(path);
  s=replaceOnce(s,`  const search=request.nextUrl.searchParams.get("search");
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search||null,p_limit:100,p_offset:0,p_include_archived:false});`,`  const search=request.nextUrl.searchParams.get("search");
  const includeArchived=request.nextUrl.searchParams.get("archived")==="1";
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search||null,p_limit:100,p_offset:0,p_include_archived:includeArchived});`,"archive list archived flag");
  write(path,s);
}

// API de documento: restaurar y eliminar físicamente sólo si ya estaba archivado.
{
  const path="app/api/archive/[id]/route.ts";let s=read(path);
  const old=`export async function DELETE(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const {data,error}=await supabase.rpc("financial_app_archive_archive",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"archive_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
`;
  const next=`export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const action=request.nextUrl.searchParams.get("action");
  if(action!=="restore")return NextResponse.json({ok:false,error:"unsupported_action"},{status:400});
  const {data,error}=await supabase.rpc("financial_app_archive_restore",{p_id:id});
  if(error||!data)return NextResponse.json({ok:false,error:error?.message||"restore_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const supabase=await authorizedClient();if(!supabase)return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const {id}=await params;const permanent=request.nextUrl.searchParams.get("permanent")==="1";
  if(!permanent){const {data,error}=await supabase.rpc("financial_app_archive_archive",{p_id:id});if(error||!data)return NextResponse.json({ok:false,error:error?.message||"archive_failed"},{status:400});return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});}
  const detail=await supabase.rpc("financial_app_archive_document",{p_id:id});if(detail.error||!detail.data)return NextResponse.json({ok:false,error:detail.error?.message||"document_unavailable"},{status:404});
  if(!detail.data.archivedAt)return NextResponse.json({ok:false,error:"archive_before_delete"},{status:409});
  if(detail.data.storagePath){const removed=await supabase.storage.from("financial-app-documents").remove([detail.data.storagePath]);if(removed.error)return NextResponse.json({ok:false,error:\`storage_delete_failed: \${removed.error.message}\`},{status:400});}
  const deleted=await supabase.rpc("financial_app_archive_delete",{p_id:id});if(deleted.error||!deleted.data)return NextResponse.json({ok:false,error:deleted.error?.message||"delete_failed"},{status:400});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
`;
  s=replaceOnce(s,old,next,"archive restore/delete route");write(path,s);
}

// Cliente Archivo: reconstrucción visual, pestaña Archivados y acciones claras.
{
  const path="app/archivo/archive-client.tsx";let s=read(path);
  s=replaceOnce(s,`onProgress(.03,"Preparando documento");let text="";let method="image_ocr";let pages=1;let confidence:number|null=null;let passes:Array<{variant:string;confidence:number|null;score:number}>=[];let worker:any=null;`,`onProgress(.03,"Preparando documento");let text="";let layoutText="";let method="image_ocr";let pages=1;let confidence:number|null=null;let passes:Array<{variant:string;confidence:number|null;score:number}>=[];let worker:any=null;`,"runOcr layout state");
  s=replaceOnce(s,`      else method="pdf_text";text=chunks.join("\\n\\n");
    }else{
      worker=await makeWorker(onProgress);const recognized=await recognizeTicketImage(file,worker,onProgress,hint);text=recognized.text;confidence=recognized.confidence;method=recognized.method;passes=recognized.passes;
    }
    if(!text.trim())throw new Error("No se ha podido extraer texto del documento");const meta=inferDocumentMetadata(text,hint);const reconstruction={generated:true,label:"Generado automáticamente mediante OCR mejorado. Puede contener errores.",engine:method==="pdf_text"?"PDF.js":"Tesseract.js 7.0.0",method,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant,previewLines:meta.lines.slice(0,80)};`,`      else method="pdf_text";text=chunks.join("\\n\\n");layoutText=text;
    }else{
      worker=await makeWorker(onProgress);const recognized=await recognizeTicketImage(file,worker,onProgress,hint);text=recognized.text;layoutText=recognized.layoutText;confidence=recognized.confidence;method=recognized.method;passes=recognized.passes;
    }
    if(!text.trim())throw new Error("No se ha podido extraer texto del documento");const meta=inferDocumentMetadata(text,hint);const reconstruction={generated:true,label:"Reconstrucción visual obtenida mediante OCR local. El original es la referencia.",engine:method==="pdf_text"?"PDF.js":"Tesseract.js 7.0.0",method,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant,layoutText:layoutText||text};`,"reconstruction layout");
  s=s.replace('imagePreprocessing:method.startsWith("image_ocr_multi:")','imagePreprocessing:method.startsWith("image_ocr_")');
  s=replaceOnce(s,`const [data,setData]=useState(initialData);const [search,setSearch]=useState("");const [busy,setBusy]=useState(false);`,`const [data,setData]=useState(initialData);const [search,setSearch]=useState("");const [showArchived,setShowArchived]=useState(false);const [busy,setBusy]=useState(false);`,"archived state");
  s=replaceOnce(s,`  async function refresh(q=search){const r=await fetch(\`/api/archive\${q.trim()?\`?search=\${encodeURIComponent(q.trim())}\`:""}\`,{cache:"no-store"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo cargar Archivo");setData(body)}`,`  async function refresh(q=search,includeArchived=showArchived){const params=new URLSearchParams();if(q.trim())params.set("search",q.trim());if(includeArchived)params.set("archived","1");const r=await fetch(\`/api/archive\${params.size?\`?\${params.toString()}\`:""}\`,{cache:"no-store"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo cargar Archivo");setData(body)}`,"refresh archived");
  s=replaceOnce(s,`  async function archiveCurrent(){if(!detail||!confirm("¿Archivar este documento? El original se conserva y no se elimina físicamente."))return;setBusy(true);try{const r=await fetch(\`/api/archive/\${detail.id}\`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo archivar");setDetail(null);setSignedUrl(null);await refresh();setMessage("Documento archivado sin borrar el original.")}catch(cause){setError(cause instanceof Error?cause.message:"Error al archivar")}finally{setBusy(false)}}`,`  async function archiveCurrent(){if(!detail||!confirm("¿Mover este documento a Archivados? Podrás restaurarlo o eliminarlo definitivamente después."))return;setBusy(true);try{const r=await fetch(\`/api/archive/\${detail.id}\`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo archivar");setDetail(null);setSignedUrl(null);await refresh(search,false);setMessage("Documento movido a Archivados. Puedes verlo en la pestaña Archivados.")}catch(cause){setError(cause instanceof Error?cause.message:"Error al archivar")}finally{setBusy(false)}}
  async function restoreCurrent(){if(!detail)return;setBusy(true);setError(null);try{const r=await fetch(\`/api/archive/\${detail.id}?action=restore\`,{method:"POST"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo restaurar");setDetail(null);setSignedUrl(null);await refresh(search,true);setMessage("Documento restaurado a Activos.")}catch(cause){setError(cause instanceof Error?cause.message:"Error al restaurar")}finally{setBusy(false)}}
  async function deleteCurrent(){if(!detail||!detail.archivedAt)return;const ok=confirm(\`¿Eliminar definitivamente \"\${detail.fileName}\"? Se borrarán el original privado, el OCR y sus vínculos. Esta acción no se puede deshacer.\`);if(!ok)return;setBusy(true);setError(null);try{const r=await fetch(\`/api/archive/\${detail.id}?permanent=1\`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error||"No se pudo eliminar");setDetail(null);setSignedUrl(null);await refresh(search,true);setMessage("Documento eliminado definitivamente.")}catch(cause){setError(cause instanceof Error?cause.message:"Error al eliminar")}finally{setBusy(false)}}`,"archive actions");
  s=replaceOnce(s,`  const currentSuggestions:ArchiveMovementRef[] = data.documents.find(d=>d.id===detail?.id)?.suggestions ?? [];
  return <div className="archive-module">`,`  const currentSuggestions:ArchiveMovementRef[] = data.documents.find(d=>d.id===detail?.id)?.suggestions ?? [];
  const visibleDocuments=data.documents.filter(doc=>showArchived?Boolean(doc.archivedAt):!doc.archivedAt);
  const reconstructionLayout=detail?.digitalReconstruction&&typeof detail.digitalReconstruction==="object"?String((detail.digitalReconstruction as Record<string,unknown>).layoutText||detail.ocrText||""):String(detail?.ocrText||"");
  async function changeView(next:boolean){setBusy(true);setError(null);try{await refresh(search,next);setShowArchived(next);setDetail(null);setSignedUrl(null)}catch(cause){setError(cause instanceof Error?cause.message:"No se pudo cambiar la vista")}finally{setBusy(false)}}
  return <div className="archive-module">`,"visible docs");
  s=replaceOnce(s,`    {error&&<div className="inline-alert error" role="alert">{error}</div>}{message&&<div className="inline-alert success" role="status">{message}</div>}
    <section className="document-grid">{data.documents.map(doc=>`,`    {error&&<div className="inline-alert error" role="alert">{error}</div>}{message&&<div className="inline-alert success" role="status">{message}</div>}
    <div className="archive-view-switch" role="tablist" aria-label="Estado de documentos"><button type="button" role="tab" aria-selected={!showArchived} className={!showArchived?"active":""} onClick={()=>changeView(false)} disabled={busy}>Activos</button><button type="button" role="tab" aria-selected={showArchived} className={showArchived?"active":""} onClick={()=>changeView(true)} disabled={busy}>Archivados</button><span>{showArchived?"Aquí están los documentos apartados. Puedes restaurarlos o eliminarlos definitivamente.":"Documentos disponibles para consulta y vinculación."}</span></div>
    <section className="document-grid">{visibleDocuments.map(doc=>`,"archive tabs");
  s=s.replace(`    {!data.documents.length&&<div className="empty-state"><strong>Archivo vacío</strong><span>Añade una factura, ticket, contrato o justificante para empezar.</span></div>}`,`    {!visibleDocuments.length&&<div className="empty-state"><strong>{showArchived?"No hay documentos archivados":"Archivo vacío"}</strong><span>{showArchived?"Los documentos que archives aparecerán aquí.":"Añade una factura, ticket, contrato o justificante para empezar."}</span></div>}`);
  s=replaceOnce(s,`      <div className="archive-actions">{signedUrl&&<a className="ghost button-link" href={signedUrl} target="_blank" rel="noreferrer">Abrir original</a>}<button className="ghost" type="button" onClick={reprocess} disabled={busy||!signedUrl}>Reprocesar OCR mejorado</button><button className="danger-action" type="button" onClick={archiveCurrent} disabled={busy}>Archivar</button></div>`,`      <div className="archive-actions">{signedUrl&&<a className="ghost button-link" href={signedUrl} target="_blank" rel="noreferrer">Abrir original</a>}{!detail.archivedAt&&<button className="ghost" type="button" onClick={reprocess} disabled={busy||!signedUrl}>Reprocesar OCR mejorado</button>}{detail.archivedAt?<><button className="ghost" type="button" onClick={restoreCurrent} disabled={busy}>Restaurar a Activos</button><button className="danger-action" type="button" onClick={deleteCurrent} disabled={busy}>Eliminar definitivamente</button></>:<button className="danger-action" type="button" onClick={archiveCurrent} disabled={busy}>Mover a Archivados</button>}</div>`,"drawer archive actions");
  s=s.replace(`<textarea rows={12} value={edit.ocrText}`,`<textarea className="ocr-text-editor" rows={12} value={edit.ocrText}`);
  s=replaceRegex(s,/\{detail\.digitalReconstruction&&<details className="trace-panel" open><summary>Reconstrucción digital<\/summary>[\s\S]*?<\/details>\}/,`{detail.digitalReconstruction&&<details className="trace-panel" open><summary>Vista reconstruida del ticket</summary><div className="ocr-warning"><strong>Reconstrucción OCR</strong><span>Se intenta conservar saltos, columnas y espacios del ticket. El original sigue siendo la referencia.</span></div><div className="receipt-preview"><div className="receipt-paper"><pre>{reconstructionLayout}</pre></div><dl className="receipt-extracted"><div><dt>Comercio</dt><dd>{detail.merchant||"—"}</dd></div><div><dt>Fecha</dt><dd>{formatDate(detail.documentDate)}</dd></div><div><dt>Total</dt><dd>{formatMoney(detail.amount)}</dd></div></dl></div></details>}`,"visual reconstruction");
  write(path,s);
}

// CSS: botones legibles, pestañas y ticket visual.
{
  const path="app/archive.css";let s=read(path);
  s+=`\n.archive-toolbar button,.archive-import-actions button,.archive-actions button,.archive-actions a{min-height:44px;padding:10px 14px;font-size:14px;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;white-space:normal}.archive-view-switch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.archive-view-switch button{min-height:40px;border:0;border-radius:9px;padding:8px 14px;background:transparent;color:var(--muted);font-weight:800;cursor:pointer}.archive-view-switch button.active{background:var(--accent-soft);color:var(--accent)}.archive-view-switch span{margin-left:auto;color:var(--muted);font-size:12px}.ocr-text-editor{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;tab-size:4}.receipt-preview{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:16px;padding:0 14px 14px;align-items:start}.receipt-paper{max-width:620px;margin:auto;width:100%;padding:30px clamp(18px,5vw,42px);background:#f8f5e9;color:#171717;border:1px solid #d8d1bc;box-shadow:0 10px 28px rgba(0,0,0,.16);border-radius:2px}.receipt-paper pre{margin:0;overflow:auto;white-space:pre;font:500 clamp(11px,1.6vw,15px)/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#171717}.receipt-extracted{display:grid;gap:0;margin:0;border:1px solid var(--border);border-radius:10px;overflow:hidden}.receipt-extracted div{display:grid;gap:4px;padding:11px 12px;border-bottom:1px solid var(--border)}.receipt-extracted div:last-child{border-bottom:0}.receipt-extracted dt{font-size:11px;color:var(--muted)}.receipt-extracted dd{margin:0;font-size:13px;font-weight:800;overflow-wrap:anywhere}@media(max-width:900px){.receipt-preview{grid-template-columns:1fr}.receipt-extracted{grid-template-columns:repeat(3,minmax(0,1fr))}.receipt-extracted div{border-bottom:0;border-right:1px solid var(--border)}.receipt-extracted div:last-child{border-right:0}}@media(max-width:680px){.archive-view-switch{display:grid;grid-template-columns:1fr 1fr}.archive-view-switch span{grid-column:1/-1;margin:0}.receipt-preview{padding:0 10px 12px}.receipt-paper{padding:22px 14px}.receipt-extracted{grid-template-columns:1fr}.receipt-extracted div{border-right:0;border-bottom:1px solid var(--border)}}\n`;
  write(path,s);
}

// Auditoría y test con el ticket real aportado.
{
  const path="scripts/ticket-ocr-v302-tests.ts";let s=read(path);
  s=replaceOnce(s,`const invoice = inferDocumentMetadata(`,`const realRestaurant = inferDocumentMetadata(\`
MI RESTAURANTE
Hora : 2026-07-11 16:41:59
Mesa : TERRAZA-13
Camarero : ADMIN
DESCRIPCION            UDS  PRECIO  TOTAL
CAÑA GRANDE              3   2.80    8.40
CORTADA                  4   1.80    7.20
COPA DE VINO             1   2.50    2.50
HAMBURGUESA CLASI        1   7.00    7.00
HAMBURGUESA ESP CA       1   8.00    8.00
SERRANITO DE POLLO       1   6.00    6.00
CUBATA                    1   5.50    5.50
Base imponible : 40.55
IVA (10%) : 4.05
TOTAL: 44.60 EUR
PENDIENTE
\`, "receipt");
assert.equal(realRestaurant.documentDate, "2026-07-11");
assert.equal(realRestaurant.amount, 44.6);
assert.equal(realRestaurant.merchant, "MI RESTAURANTE");

const invoice = inferDocumentMetadata(`,"real ticket metadata test");
  write(path,s);
}
{
  const path="scripts/audit-ticket-ocr-v302.mjs";let s=read(path);
  s=s.replace(`must(engine.includes("imageVariants"), "Debe existir preprocesado local de imagen");`,`must(engine.includes("imageVariants")&&engine.includes("detectReceiptBounds"), "Debe existir detección, recorte y preprocesado local del ticket");`);
  s=s.replace(`must(engine.includes('"enhanced_block"') && engine.includes('"binary_sparse"'), "Debe haber estrategias OCR alternativas");`,`must(engine.includes('"enhanced_block"')&&engine.includes('"enhanced_column"')&&engine.includes('"binary_sparse"'), "Debe haber estrategias OCR alternativas para bloque, columnas y caracteres difíciles");\nmust(engine.includes("preserveOcrLayout"), "Debe conservarse el espaciado para reconstruir visualmente el ticket");`);
  s=s.replace(`must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");`,`must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");\nmust(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"), "La reconstrucción OCR debe presentarse con apariencia de ticket, no como JSON técnico");\nmust(client.includes("Archivados")&&client.includes("Eliminar definitivamente")&&client.includes("Restaurar a Activos"), "Archivo debe explicar y gestionar el ciclo Activos/Archivados/eliminación");`);
  write(path,s);
}

console.log("Archive/OCR 3.0.4 patch applied");
