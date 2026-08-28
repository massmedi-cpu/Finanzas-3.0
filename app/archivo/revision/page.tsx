import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getDocumentTriage } from "@/lib/financial/document-triage";
import { DocumentTriageClient } from "./triage-client";

export const dynamic="force-dynamic";

export default async function ArchiveReviewPage(){
  await requireAuthorizedUser();
  const data=await getDocumentTriage(60);
  const actionable=data.summary.reviewOcr+data.summary.completeMetadata+data.summary.readyToLink+data.summary.reviewMatch+data.summary.investigateNoMatch+data.summary.archiveCandidate;
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Atención documental</h1><p>{actionable} documento{actionable===1?"":"s"} activo{actionable===1?"":"s"} requiere{actionable===1?"":"n"} una acción o revisión. La cola unifica OCR, metadatos, matching y archivado, prioriza lo que bloquea el flujo y explica siempre el motivo.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo">Volver al Archivo</Link></div></header>
    <DocumentTriageClient data={data}/>
  </section></main>;
}
