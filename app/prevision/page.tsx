import { APP_VERSION } from "@/lib/app-version";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getForecastCalendar } from "@/lib/financial/forecast-calendar";
import { getForecastLiquidity } from "@/lib/financial/forecast-liquidity";
import { ForecastLiquidityDashboard } from "@/components/forecast-liquidity-dashboard";
import { ForecastClient } from "./forecast-client";

export const dynamic="force-dynamic";

export default async function ForecastPage(){
  await requireAuthorizedUser();
  const[initialData,liquidity]=await Promise.all([getForecastCalendar(12),getForecastLiquidity(90)]);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace forecast-workspace">
    <header className="topbar"><div>
      <p className="eyebrow">PREVISIÓN · {APP_VERSION}</p>
      <h1>Agenda Financiera Inteligente</h1>
      <p>No solo muestra qué cargos e ingresos se esperan: parte del saldo operativo actual y calcula cómo evoluciona tu liquidez durante los próximos 90 días. Las fechas siguen siendo estimadas y un movimiento solo queda confirmado cuando aparece en el banco.</p>
    </div></header>
    <ForecastLiquidityDashboard data={liquidity}/>
    <ForecastClient initialData={initialData}/>
  </section></main>;
}
