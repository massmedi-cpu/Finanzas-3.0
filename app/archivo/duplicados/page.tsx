import Link from "next/link";
import {requireAuthorizedUser} from "@/lib/auth/require-user";
import {getCompleteArchiveOverview} from "@/lib/financial/archive";
import {detectArchiveDuplicateCandidates} from "@/lib/document/archive-duplicate-detection";
import {DuplicateReviewClient} from "./duplicate-review-client";

export const dynamic="force-dynamic";

export default async function ArchiveDuplicatesPage(){
  await requireAuthorizedUser();
  const overview=await getCompleteArchiveOverview();
  const candidates=detectArchiveDuplicateCandidates(overview.documents);
  const exact=candidates.filter(candidate=>candidate.confidence==="exact").length;
  const high=candidates.filter(candidate=>candidate.confidence==="high").length;
  const possible=candidates.filter(candidate=>candidate.confidence==="possible").length;
  const pairs=candidates.map(candidate=>({
    id:candidate.id,
    confidence:candidate.confidence,
    score:candidate.score,
    reasons:candidate.reasons,
    left:{
      id:candidate.left.id,fileName:candidate.left.fileName,documentType:candidate.left.documentType,documentDate:candidate.left.documentDate,amount:candidate.left.amount,merchant:candidate.left.merchant,ocrStatus:candidate.left.ocrStatus,lifecycleState:candidate.left.lifecycleState,fileSize:candidate.left.fileSize,contentHash:candidate.left.contentHash,archivedAt:candidate.left.archivedAt,linkCount:candidate.left.links.length,hasOcrText:candidate.left.hasOcrText,hasReconstruction:candidate.left.hasReconstruction,
    },
    right:{
      id:candidate.right.id,fileName:candidate.right.fileName,documentType:candidate.right.documentType,documentDate:candidate.right.documentDate,amount:candidate.right.amount,merchant:candidate.right.merchant,ocrStatus:candidate.right.ocrStatus,lifecycleState:candidate.right.lifecycleState,fileSize:candidate.right.fileSize,contentHash:candidate.right.contentHash,archivedAt:candidate.right.archivedAt,linkCount:candidate.right.links.length,hasOcrText:candidate.right.hasOcrText,hasReconstruction:candidate.right.hasReconstruction,
    },
  }));

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · CONTROL DE CALIDAD</p><h1>Duplicados documentales</h1><p>Compara posibles copias del mismo ticket, factura o justificante. La detección usa evidencia documental y nunca elimina archivos de forma automática.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo">Volver a Archivo</Link></div></header>
    <div className="operations-summary" aria-label="Resumen de duplicados documentales">
      <div><span>Pares detectados</span><strong>{candidates.length}</strong></div><div><span>Exactos</span><strong>{exact}</strong></div><div><span>Muy probables</span><strong>{high}</strong></div><div><span>Posibles</span><strong>{possible}</strong></div>
    </div>
    <div className="archive-library-note"><span><strong>{overview.documents.length} documentos revisados</strong><br/>La comprobación recorre documentos activos y archivados. Los hashes idénticos son exactos; fecha + importe + tamaño exacto se trata como coincidencia muy probable.</span></div>
    <DuplicateReviewClient pairs={pairs}/>
  </section></main>;
}
