import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getArchiveOverview } from "@/lib/financial/archive";
import { AppSidebar } from "@/components/app-sidebar";
import { ArchiveClient } from "./archive-client";
export const dynamic="force-dynamic";
export default async function ArchivePage(){await requireAuthorizedUser();const data=await getArchiveOverview();return <main className="app-shell"><AppSidebar active="/archivo" status="Archivo · privado · OCR local"/><section className="workspace archive-workspace"><header className="topbar"><div><p className="eyebrow">ARCHIVO · {data.version}</p><h1>Archivo</h1><p>Guarda facturas, tickets y documentos financieros. El original es privado y el OCR se procesa en tu dispositivo.</p></div></header><ArchiveClient initialData={data}/></section></main>}
