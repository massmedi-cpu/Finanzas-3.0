import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getRulesOverview } from "@/lib/financial/rules";
import { RulesClient } from "./rules-client";

export const dynamic="force-dynamic";

export default async function RulesPage(){
  await requireAuthorizedUser();
  const data=await getRulesOverview();
  return <main className="app-shell">
    <section id="main-content" tabIndex={-1} className="workspace rules-workspace">
      <header className="topbar"><div><p className="eyebrow">AUTOMATIZACIONES · {data.version}</p><h1>Clasificación automática</h1><p>Una automatización es una instrucción del tipo «si llega un movimiento de este comercio, clasifícalo así». Se aplica a movimientos nuevos sin tocar el dato bancario y puedes revisar o deshacer sus efectos.</p></div></header>
      <RulesClient initialData={data}/>
    </section>
  </main>;
}
