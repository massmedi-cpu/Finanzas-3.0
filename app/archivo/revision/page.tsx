import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getArchiveReviewQueue } from "@/lib/financial/archive";
import { ArchiveReviewClient } from "./review-client";

export const dynamic="force-dynamic";

export default async function ArchiveReviewPage(){
  await requireAuthorizedUser();
  const data=await getArchiveReviewQueue();
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace">
    <header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Documentos por revisar</h1><p>{data.total} documento{data.total===1?"":"s"} con una o más coincidencias posibles. Elige solo cuando la relación sea correcta.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo">Volver al Archivo</Link></div></header>
    <ArchiveReviewClient data={data}/>
  </section></main>;
}
