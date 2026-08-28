import Link from "next/link";
import {requireAuthorizedUser} from "@/lib/auth/require-user";
import {getArchiveOverview,getArchivedDocuments} from "@/lib/financial/archive";
import {ArchiveClient} from "./archive-client";
import {ArchiveLifecycleClient} from "./archive-lifecycle-client";

export const dynamic="force-dynamic";
type ArchiveView="new"|"pending"|"archived";

export default async function ArchivePage({searchParams}:{searchParams:Promise<{view?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const view:ArchiveView=params.view==="pending"||params.view==="archived"?params.view:"new";
  const [active,archived]=await Promise.all([getArchiveOverview(),getArchivedDocuments()]);
  const pending=active.documents.filter(document=>["pending","processing","needs_review","failed","error"].includes(document.ocrStatus)||(document.links.length===0&&document.suggestions.length>0)).length;
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · {active.version}</p><h1>Archivo</h1><p>Centro documental para facturas, tickets y justificantes. Los originales permanecen privados, los documentos nuevos no se archivan automáticamente y el histórico siempre puede recuperarse.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo/revision">Revisar asociaciones{pending?` · ${pending}`:""}</Link></div></header>
    <ArchiveLifecycleClient active={active.documents} archived={archived.documents} view={view}/>
    {view==="new"&&<section className="archive-active-library" aria-label="Gestión de documentos nuevos"><div className="archive-active-library-head"><div><p className="eyebrow">GESTIÓN</p><h2>Procesar documentos nuevos</h2><p>Escanea, revisa el OCR, corrige metadatos, vincula movimientos y conserva el original antes de archivar.</p></div></div><ArchiveClient key={`archive-active-${active.total}`} initialData={active}/></section>}
    {view==="pending"&&<div className="archive-view-note"><strong>La cola pendiente se resuelve en Revisión.</strong><span>Así se evita duplicar el editor documental y se mantiene una sola fuente de verdad para OCR y asociaciones.</span><Link className="primary-action" href="/archivo/revision">Ir a Revisión</Link></div>}
  </section></main>
}
