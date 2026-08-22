import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getMovements } from "@/lib/financial/movements";
import { movementFiltersForData, parseMovementSearchParams } from "@/lib/financial/movement-query";
import { AppSidebar } from "@/components/app-sidebar";
import { MovementsClient } from "./movements-client";

export const dynamic = "force-dynamic";

export default async function MovementsPage({ searchParams }:{ searchParams:Promise<Record<string,string|undefined>> }) {
  await requireAuthorizedUser();
  const params = await searchParams;
  const initialFilters = parseMovementSearchParams(params);
  const initialData = await getMovements(movementFiltersForData(initialFilters));

  return <main className="app-shell">
    <AppSidebar active="/movimientos" status="Origen protegido · edición trazable" />
    <section id="main-content" tabIndex={-1} className="workspace movements-workspace">
      <header className="topbar movements-heading"><div><p className="eyebrow">MOVIMIENTOS · {initialData.version||"1.0.0-rc.1"}</p><h1>Movimientos</h1><p>Busca, filtra, revisa, divide y concilia sin modificar nunca el dato bancario original.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/movimientos/conciliacion">Conciliación</Link><Link className="ghost button-link" href="/">Volver al inicio</Link></div></header>
      <MovementsClient initialData={initialData} initialFilters={initialFilters} />
    </section>
  </main>;
}
