import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getArchiveOverview } from "@/lib/financial/archive";
import { ArchiveClient } from "./archive-client";
export const dynamic="force-dynamic";
export default async function ArchivePage(){await requireAuthorizedUser();const data=await getArchiveOverview();const pending=data.documents.filter(document=>!document.archivedAt&&document.links.length===0&&document.suggestions.length>0).length;return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace"><header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Archivo</h1><p>Una sola biblioteca para facturas, tickets y documentos financieros. El original es privado y el OCR se procesa automáticamente en tu dispositivo.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/archivo/revision">Revisar asociaciones{pending?` · ${pending}`:""}</Link></div></header><ArchiveClient initialData={data}/></section></main>}
