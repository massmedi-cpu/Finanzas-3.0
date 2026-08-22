import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getRulesOverview } from "@/lib/financial/rules";
import { RulesClient } from "./rules-client";

export const dynamic="force-dynamic";

export default async function RulesPage(){
  await requireAuthorizedUser();
  const data=await getRulesOverview();
  return <main className="app-shell">
    
    <section id="main-content" tabIndex={-1} className="workspace rules-workspace">
      <header className="topbar"><div><p className="eyebrow">REGLAS AUTOMÁTICAS · {data.version}</p><h1>Reglas de movimientos</h1><p>Clasifica movimientos nuevos y aplica cambios retroactivos con vista previa, historial y deshacer seguro.</p></div></header>
      <RulesClient initialData={data}/>
    </section>
  </main>;
}
