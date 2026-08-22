import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getBudgetMonth } from "@/lib/financial/budget";
import { BudgetClient } from "./budget-client";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  await requireAuthorizedUser();
  const data = await getBudgetMonth();
  return <main className="app-shell">
    
    <section id="main-content" tabIndex={-1} className="workspace budget-workspace">
      <header className="topbar"><div><p className="eyebrow">PRESUPUESTO · {data.version}</p><h1>Presupuesto</h1><p>Asigna límites por categoría y controla cuánto has gastado y cuánto te queda disponible.</p></div><Link className="ghost button-link" href="/movimientos">Ver movimientos</Link></header>
      <BudgetClient initialData={data} />
    </section>
  </main>;
}
