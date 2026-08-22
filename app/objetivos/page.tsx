import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getGoalsOverview } from "@/lib/financial/goals";
import { AppSidebar } from "@/components/app-sidebar";
import { GoalsClient } from "./goals-client";

export const dynamic="force-dynamic";

export default async function GoalsPage(){
  await requireAuthorizedUser();
  const data=await getGoalsOverview();
  return <main className="app-shell">
    <AppSidebar active="/objetivos" status="Objetivos · progreso trazable · fuente protegida" />
    <section id="main-content" tabIndex={-1} className="workspace goals-workspace">
      <header className="topbar"><div><p className="eyebrow">OBJETIVOS · {data.version}</p><h1>Objetivos financieros</h1><p>Convierte tus metas en un plan medible sin mezclar datos reales con supuestos.</p></div><Link className="ghost button-link" href="/prevision">Ver previsión</Link></header>
      <GoalsClient initialData={data}/>
    </section>
  </main>;
}
