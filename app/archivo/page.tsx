import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getArchiveOverview } from "@/lib/financial/archive";
import { ArchiveClient } from "./archive-client";
export const dynamic="force-dynamic";
export default async function ArchivePage(){await requireAuthorizedUser();const data=await getArchiveOverview();return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace archive-workspace"><header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Archivo</h1><p>Una sola biblioteca para facturas, tickets y documentos financieros. El original es privado y el OCR se procesa automáticamente en tu dispositivo.</p></div></header><ArchiveClient initialData={data}/></section></main>}
