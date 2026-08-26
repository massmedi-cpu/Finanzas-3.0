import { APP_VERSION } from "@/lib/app-version";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getForecastCalendar } from "@/lib/financial/forecast-calendar";
import { ForecastClient } from "./forecast-client";

export const dynamic="force-dynamic";

export default async function ForecastPage(){
  await requireAuthorizedUser();
  const initialData=await getForecastCalendar(12);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace forecast-workspace">
    <header className="topbar"><div>
      <p className="eyebrow">PREVISIÓN · {APP_VERSION}</p>
      <h1>Calendario de próximos movimientos</h1>
      <p>Qué cargos e ingresos se esperan cada mes, sobre qué fecha y cuáles ya han llegado de verdad. La fecha es estimada; un movimiento solo queda confirmado cuando aparece en el banco.</p>
    </div></header>
    <ForecastClient initialData={initialData}/>
  </section></main>;
}
