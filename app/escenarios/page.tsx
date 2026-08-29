import { APP_VERSION } from "@/lib/app-version";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getForecastLiquidity } from "@/lib/financial/forecast-liquidity";
import { ScenarioLab } from "./scenario-lab";

export const dynamic="force-dynamic";

export default async function ScenariosPage(){
  await requireAuthorizedUser();
  const baseline=await getForecastLiquidity(90);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace scenario-workspace">
    <header className="topbar"><div><p className="eyebrow">SIMULADOR · {APP_VERSION}</p><h1>Simulador de Decisiones</h1><p>Prueba decisiones antes de tomarlas. Combina gastos, ingresos, cuotas y recurrencias y compara su impacto con la Agenda Financiera real, sin guardar ni alterar tus datos.</p></div></header>
    <ScenarioLab baseline={baseline}/>
  </section></main>;
}
