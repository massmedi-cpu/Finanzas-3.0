import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getSettingsOverview } from "@/lib/financial/settings";
import { AppSidebar } from "@/components/app-sidebar";
import { SettingsClient } from "./settings-client";
export const dynamic="force-dynamic";
export default async function SettingsPage(){await requireAuthorizedUser();const data=await getSettingsOverview();return <main className="app-shell"><AppSidebar active="/configuracion" status="Configuración · seguridad · sistema"/><section id="main-content" tabIndex={-1} className="workspace settings-workspace"><header className="topbar"><div><p className="eyebrow">CONFIGURACIÓN · {data.version}</p><h1>Configuración</h1><p>Preferencias, seguridad, fuente de datos y estado técnico de Financial App.</p></div></header><SettingsClient initialData={data}/></section></main>}
