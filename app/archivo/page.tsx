import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAuthorizedUser} from "@/lib/auth/require-user";
import {getArchiveOverview,getArchiveLifecycleOverview,type ArchiveLifecycleState} from "@/lib/financial/archive";
import {ArchiveClient} from "./archive-client-shell";
import {ArchiveLifecycleClient} from "./archive-lifecycle-client";
import {ArchiveBulkOcrRecoveryDeferred} from "./archive-bulk-ocr-recovery-deferred";

export const dynamic="force-dynamic";
const PAGE_SIZE=40;
const NEW_VIEW_COUNT_LIMIT=1;

function archiveUrl(view:ArchiveLifecycleState,query:string,page:number){
  const params=new URLSearchParams({view});
  if(query)params.set("q",query);
  if(page>1)params.set("page",String(page));
  return `/archivo?${params.toString()}`;
}

function recoveryFeedback(state:string|undefined){
  if(state==="updated")return{tone:"success",message:"OCR reprocesado desde el original. Se han conservado las correcciones y asociaciones existentes."};
  if(state==="skipped")return{tone:"success",message:"El documento ya no necesitaba reprocesado o cambió durante la operación. No se ha sobrescrito nada."};
  if(state==="error")return{tone:"error",message:"No se pudo reprocesar el OCR. La evidencia anterior permanece intacta."};
  return null;
}

export default async function ArchivePage({searchParams}:{searchParams:Promise<{view?:string;q?:string;page?:string;ocrRecovery?:string;ocrDocument?:string}>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const view:ArchiveLifecycleState=params.view==="pending"||params.view==="archived"?params.view:"new";
  const query=String(params.q||"").trim().slice(0,160);
  const requestedPage=Number.parseInt(String(params.page||"1"),10);
  const page=Number.isFinite(requestedPage)&&requestedPage>0?requestedPage:1;
  const offset=(page-1)*PAGE_SIZE;
  const feedback=recoveryFeedback(params.ocrRecovery);

  const lifecyclePromise=getArchiveLifecycleOverview(
    view,
    view==="new"?null:query||null,
    view==="new"?NEW_VIEW_COUNT_LIMIT:PAGE_SIZE,
    view==="new"?0:offset,
  );
  const activePromise=view==="new"?getArchiveOverview(null,PAGE_SIZE,0):Promise.resolve(null);
  const [lifecycle,active]=await Promise.all([lifecyclePromise,activePromise]);

  const totalPages=view==="new"?1:Math.max(1,Math.ceil(lifecycle.total/PAGE_SIZE));
  if(view!=="new"&&page>totalPages)redirect(archiveUrl(view,query,totalPages));

  const pending=lifecycle.counts.pending;
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · {lifecycle.version}</p><h1>Archivo</h1><p>Centro documental para facturas, tickets y justificantes. Los originales permanecen privados, los documentos nuevos no se archivan automáticamente y el histórico siempre puede recuperarse.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo/duplicados">Revisar duplicados</Link>{view!=="pending"&&<Link className="ghost button-link" href="/archivo/revision">Revisar pendientes{pending?` · ${pending}`:""}</Link>}</div></header>
    {feedback&&<div className={`inline-alert ${feedback.tone}`} role={feedback.tone==="error"?"alert":"status"}>{feedback.message}</div>}
    <ArchiveBulkOcrRecoveryDeferred initialCount={pending} shouldCheck={true}/>
    <ArchiveLifecycleClient
      documents={view==="new"?[]:lifecycle.documents}
      counts={lifecycle.counts}
      total={view==="new"?lifecycle.counts.new:lifecycle.total}
      view={view}
      query={query}
      page={view==="new"?1:page}
      pageSize={PAGE_SIZE}
    />
    {view==="new"&&active&&<section className="archive-active-library" aria-label="Gestión de documentos activos"><div className="archive-active-library-head"><div><p className="eyebrow">GESTIÓN</p><h2>Gestionar documentos activos</h2><p>Escanea, abre, revisa el OCR, corrige metadatos y vincula movimientos desde una sola biblioteca. Los documentos que requieren revisión siguen identificados en Pendientes.</p></div></div><ArchiveClient key={`archive-active-${active.total}`} initialData={active}/></section>}
  </section></main>;
}
