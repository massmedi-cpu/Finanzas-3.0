"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {formatEuro} from "@/lib/format/es-es";
import type {ArchiveDocument} from "@/lib/financial/archive";

type View="new"|"pending"|"archived";
type Props={active:ArchiveDocument[];archived:ArchiveDocument[];view:View};

const dates=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function formatDate(value:string|null,createdAt:string){const raw=value?`${value}T12:00:00`:createdAt;return dates.format(new Date(raw))}
function isPending(document:ArchiveDocument){return ["pending","processing","needs_review","failed","error"].includes(document.ocrStatus)||(document.links.length===0&&document.suggestions.length>0)}
function statusCopy(document:ArchiveDocument){if(document.archivedAt)return"Archivada";if(isPending(document))return"Pendiente";return"Nueva"}
function statusClass(document:ArchiveDocument){if(document.archivedAt)return"muted";if(isPending(document))return"warning";return"ok"}
function DocumentIcon({image}:{image:boolean}){return <span className="archive-lifecycle-icon" aria-hidden="true"><svg className="financial-icon" viewBox="0 0 24 24"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>{image?<><circle cx="10" cy="12" r="1.4"/><path d="m8.5 17 2.7-2.7 1.9 1.9 1.4-1.4 1.5 1.5"/></>:<><path d="M9 12h6M9 15h6"/></>}</svg></span>}

export function ArchiveLifecycleClient({active,archived,view}:Props){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);
  const pending=useMemo(()=>active.filter(isPending),[active]);
  const fresh=useMemo(()=>active.filter(document=>!isPending(document)),[active]);
  const source=view==="archived"?archived:view==="pending"?pending:fresh;
  const visible=useMemo(()=>{const q=query.trim().toLocaleLowerCase("es");if(!q)return source;return source.filter(document=>[document.fileName,document.merchant,document.documentType,document.ocrStatus].filter(Boolean).some(value=>String(value).toLocaleLowerCase("es").includes(q)))},[query,source]);
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
      <Link className={view==="new"?"active":""} href="/archivo?view=new"><span>Nuevas</span><b>{fresh.length}</b></Link>
      <Link className={view==="pending"?"active":""} href="/archivo?view=pending"><span>Pendientes</span><b>{pending.length}</b></Link>
      <Link className={view==="archived"?"active":""} href="/archivo?view=archived"><span>Archivadas</span><b>{archived.length}</b></Link>
    </nav>

    <div className="archive-lifecycle-head">
      <div><p className="eyebrow">{view==="archived"?"HISTÓRICO":view==="pending"?"REQUIERE ATENCIÓN":"ENTRADA DOCUMENTAL"}</p><h2>{view==="archived"?"Documentos archivados":view==="pending"?"Pendientes de revisión":"Documentos nuevos"}</h2><p>{view==="archived"?"Conservados sin alterar importes, fechas ni vínculos. Puedes desarchivarlos en cualquier momento.":view==="pending"?"OCR, asociación o metadatos requieren revisión antes de cerrar el documento.":"Los documentos futuros permanecen aquí hasta que decidas archivarlos."}</p></div>
      <label className="archive-lifecycle-search"><span>Buscar en esta vista</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Proveedor, archivo o tipo…"/></label>
    </div>

    {feedback&&<div className="inline-alert info" role="status">{feedback}</div>}
    {view==="pending"&&pending.length>0&&<div className="archive-review-callout"><div><strong>{pending.length} documento{pending.length===1?"":"s"} requieren revisión</strong><span>Resuelve OCR y asociaciones sugeridas antes de archivarlos.</span></div><Link className="primary-action" href="/archivo/revision">Abrir revisión</Link></div>}

    <div className="archive-lifecycle-list">
      {visible.map(document=><article key={document.id} className="archive-lifecycle-row">
        <DocumentIcon image={Boolean(document.mimeType?.startsWith("image/"))}/>
        <div className="archive-lifecycle-copy"><strong>{document.merchant||document.fileName}</strong><span>{document.merchant?document.fileName:document.documentType} · {formatDate(document.documentDate,document.createdAt)}</span><small>{document.amount==null?"Importe pendiente":formatEuro(document.amount)} · {document.links.length} vínculo{document.links.length===1?"":"s"}</small></div>
        <div className="archive-lifecycle-side"><span className={`status-badge ${statusClass(document)}`}>{statusCopy(document)}</span>{view==="archived"?<button className="secondary-action" type="button" disabled={busy===document.id} aria-busy={busy===document.id||undefined} onClick={()=>mutate(document,"restore")}>{busy===document.id?"Desarchivando…":"Desarchivar"}</button>:view==="new"?<button className="secondary-action" type="button" disabled={busy===document.id} aria-busy={busy===document.id||undefined} onClick={()=>mutate(document,"archive")}>{busy===document.id?"Archivando…":"Archivar"}</button>:null}</div>
      </article>)}
    </div>
    {!visible.length&&<div className="empty-state"><strong>{query?"Sin coincidencias":view==="archived"?"No hay documentos archivados":view==="pending"?"No hay documentos pendientes":"No hay documentos nuevos"}</strong><span>{query?"Prueba con otro proveedor, nombre de archivo o tipo.":view==="new"?"Las próximas facturas y tickets aparecerán aquí.":view==="pending"?"No hay revisiones documentales abiertas.":"Cuando archives un documento aparecerá en este histórico."}</span></div>}
  </section>
}
