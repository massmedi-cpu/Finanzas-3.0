import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-sidebar";
import { getForecastOverview } from "@/lib/financial/forecast";
import { ForecastClient } from "./forecast-client";

export const dynamic="force-dynamic";

export default async function ForecastPage(){
  await requireAuthorizedUser();
  const initialData=await getForecastOverview(90);
  return <main className="app-shell"><AppSidebar active="/prevision" status="Previsión · histórico + confirmaciones"/><section className="workspace forecast-workspace">
    <header className="topbar"><div><p className="eyebrow">PREVISIÓN · {initialData.version}</p><h1>Previsión financiera</h1><p>Proyecta el saldo futuro con cargos confirmados y patrones históricos explicables.</p></div></header>
    <ForecastClient initialData={initialData}/>
  </section></main>;
}
