"use client";

import Link from "next/link";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {formatEuro} from "@/lib/format/es-es";
import type {ArchiveDocument,ArchiveLifecycleCounts,ArchiveLifecycleState} from "@/lib/financial/archive";

type Props={
  documents:ArchiveDocument[];
  counts:ArchiveLifecycleCounts;
  total:number;
  view:ArchiveLifecycleState;
  query:string;
  page:number;
  pageSize:number;
};

const dates=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function formatDate(value:string|null,createdAt:string){const raw=value?`${value}T12:00:00`:createdAt;return dates.format(new Date(raw))}
function isPending(document:ArchiveDocument){return ["pending","processing","needs_review","failed","error"].includes(document.ocrStatus)||(document.links.length===0&&document.suggestions.length>0)}
function statusCopy(document:ArchiveDocument){if(document.archivedAt)return"Archivada";if(isPending(document))return"Pendiente";return"Nueva"}
function statusClass(document:ArchiveDocument){if(document.archivedAt)return"muted";if(isPending(document))return"warning";return"ok"}
function DocumentIcon({image}:{image:boolean}){return <span className="archive-lifecycle-icon" aria-hidden="true"><svg className="financial-icon" viewBox="0 0 24 24" fill="none"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>{image?<><circle cx="10" cy="12" r="1.4"/><path d="m8.5 17 2.7-2.7 1.9 1.9 1.4-1.4 1.5 1.5"/></>:<><path d="M9 12h6M9 15h6"/></>}</svg></span>}
function archiveHref(view:ArchiveLifecycleState,query:string,page=1){const params=new URLSearchParams({view});if(query)params.set("q",query);if(page>1)params.set("page",String(page));return `/archivo?${params.toString()}`}

export function ArchiveLifecycleClient({documents,counts,total,view,query,page,pageSize}:Props){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const firstVisible=total===0?0:(page-1)*pageSize+1;
  const lastVisible=Math.min(total,page*pageSize);

  async function mutate(document:ArchiveDocument,action:"archive"|"restore"){
    if(busy)return;
    setBusy(document.id);setFeedback(null);
    try{
      const response=await fetch(`/api/archive/${document.id}?action=${action}`,{method:"POST"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"document_state_failed");
      setFeedback(action==="archive"?"Documento archivado.":"Documento desarchivado y devuelto a Nuevas.");
      router.refresh();
    }catch{setFeedback(action==="archive"?"No se ha podido archivar el documento.":"No se ha podido desarchivar el documento.")}
    finally{setBusy(null)}
  }

  return <section className="archive-lifecycle" aria-label="Estados de Archivo">
    <nav className="archive-state-nav" aria-label="Estados documentales">
      <Link className={view==="new"?"active":""} href={archiveHref("new",query)}><span>Nuevas</span><b>{counts.new}</b></Link>
      <Link className={view==="pending"?"active":""} href={archiveHref("pending",query)}><span>Pendientes</span><b>{counts.pending}</b></Link>
      <Link className={view==="archived"?"active":""} href={archiveHref("archived",query)}><span>Archivadas</span><b>{counts.archived}</b></Link>
    </nav>

    {view!=="new"&&<>
      <div className="archive-lifecycle-head">
        <div><p className="eyebrow">{view==="archived"?"HISTÓRICO":"REQUIERE ATENCIÓN"}</p><h2>{view==="archived"?"Documentos archivados":"Pendientes de revisión"}</h2><p>{view==="archived"?"Conservados sin alterar importes, fechas ni vínculos. Puedes desarchivarlos en cualquier momento.":"OCR, asociación o metadatos requieren revisión antes de cerrar el documento."}</p></div>
        <form className="archive-lifecycle-search" action="/archivo" method="get">
          <input type="hidden" name="view" value={view}/>
          <label><span>Buscar en esta vista</span><input name="q" type="search" defaultValue={query} placeholder="Proveedor, archivo o texto OCR…" maxLength={160}/></label>
          <button className="secondary-action" type="submit">Buscar</button>
          {query&&<Link className="ghost-action" href={archiveHref(view,"")}>Limpiar</Link>}
        </form>
      </div>

      {feedback&&<div className="inline-alert info" role="status">{feedback}</div>}
      {view==="pending"&&total>0&&<div className="archive-review-callout"><div><strong>{total} documento{total===1?"":"s"} requieren revisión</strong><span>Resuelve OCR y asociaciones sugeridas antes de archivarlos.</span></div><Link className="primary-action" href="/archivo/revision">Abrir revisión</Link></div>}

      <div className="archive-lifecycle-list">
        {documents.map(document=><article key={document.id} className="archive-lifecycle-row">
          <DocumentIcon image={Boolean(document.mimeType?.startsWith("image/"))}/>
          <div className="archive-lifecycle-copy"><strong>{document.merchant||document.fileName}</strong><span>{document.merchant?document.fileName:document.documentType} · {formatDate(document.documentDate,document.createdAt)}</span><small>{document.amount==null?"Importe pendiente":formatEuro(document.amount)} · {document.links.length} vínculo{document.links.length===1?"":"s"}</small></div>
          <div className="archive-lifecycle-side"><span className={`status-badge ${statusClass(document)}`}>{statusCopy(document)}</span>{view==="archived"?<button className="secondary-action" type="button" disabled={busy===document.id} aria-busy={busy===document.id||undefined} onClick={()=>mutate(document,"restore")}>{busy===document.id?"Desarchivando…":"Desarchivar"}</button>:view==="new"?<button className="secondary-action" type="button" disabled={busy===document.id} aria-busy={busy===document.id||undefined} onClick={()=>mutate(document,"archive")}>{busy===document.id?"Archivando…":"Archivar"}</button>:null}</div>
        </article>)}
      </div>

      {!documents.length&&<div className="empty-state"><strong>{query?"Sin coincidencias":view==="archived"?"No hay documentos archivados":"No hay documentos pendientes"}</strong><span>{query?"Prueba con otro proveedor, nombre de archivo o texto del documento.":view==="pending"?"No hay revisiones documentales abiertas.":"Cuando archives un documento aparecerá en este histórico."}</span></div>}

      {totalPages>1&&<nav className="archive-lifecycle-pagination" aria-label="Paginación de documentos"><span>{firstVisible}–{lastVisible} de {total}</span><div>{page>1?<Link className="secondary-action" href={archiveHref(view,query,page-1)}>Anterior</Link>:<span/>}<strong>Página {page} de {totalPages}</strong>{page<totalPages?<Link className="secondary-action" href={archiveHref(view,query,page+1)}>Siguiente</Link>:<span/>}</div></nav>}
    </>}
  </section>
}
