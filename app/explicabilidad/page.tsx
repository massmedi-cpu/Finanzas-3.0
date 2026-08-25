import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getExplainabilityOverview } from "@/lib/financial/explainability";
import { ExplainabilityClient } from "./explainability-client";

export const dynamic="force-dynamic";

export default async function ExplainabilityPage(){
  await requireAuthorizedUser();
  const data=await getExplainabilityOverview(20);
  return <main className="app-shell">
    <section id="main-content" tabIndex={-1} className="workspace explainability-workspace">
      <header className="topbar"><div><p className="eyebrow">EXPLICABILIDAD · {data.version}</p><h1>Por qué está clasificado así</h1><p>Consulta de dónde sale cada clasificación y decide si quieres que Financial App aprenda patrones repetidos para clasificar automáticamente movimientos futuros.</p></div></header>
      <ExplainabilityClient initialData={data}/>
    </section>
  </main>;
}
