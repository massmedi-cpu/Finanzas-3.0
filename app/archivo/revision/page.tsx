import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getDocumentOperations } from "@/lib/financial/document-operations";
import { DocumentTriageClient } from "./triage-client";

export const dynamic="force-dynamic";

export default async function ArchiveReviewPage(){
  await requireAuthorizedUser();
  const data=await getDocumentOperations(60);
  const actionable=data.summary.reviewOcr+data.summary.completeMetadata+data.summary.readyToLink+data.summary.reviewMatch+data.summary.investigateNoMatch+data.summary.archiveCandidate;
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Bandeja de conciliación documental</h1><p>{actionable} documento{actionable===1?"":"s"} requiere{actionable===1?"":"n"} atención. Revisa el original, corrige los datos, valida OCR, comprueba coincidencias y resuelve el caso desde una única secuencia de trabajo.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/movimientos/conciliacion">Conciliación de movimientos</Link><Link className="ghost button-link" href="/archivo">Volver al Archivo</Link></div></header>
    <DocumentTriageClient data={data}/>
  </section></main>;
}
