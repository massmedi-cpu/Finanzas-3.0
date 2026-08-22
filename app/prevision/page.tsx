import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getForecastOverview } from "@/lib/financial/forecast";
import { ForecastClient } from "./forecast-client";
import { ScenarioSimulator } from "./scenario-simulator";

export const dynamic="force-dynamic";

export default async function ForecastPage(){
  await requireAuthorizedUser();
  const initialData=await getForecastOverview(90);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace forecast-workspace">
    <header className="topbar"><div><p className="eyebrow">PREVISIÓN · {initialData.version}</p><h1>Previsión financiera</h1><p>Proyecta el saldo con previsiones confirmadas, sugerencias explicables y escenarios temporales que no alteran tus datos.</p></div></header>
    <ForecastClient initialData={initialData}/>
    <ScenarioSimulator startDate={initialData.startDate} initialDays={initialData.days}/>
  </section></main>;
}
