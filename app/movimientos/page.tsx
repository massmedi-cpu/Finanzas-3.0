import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getMovements } from "@/lib/financial/movements";
import { AppSidebar } from "@/components/app-sidebar";
import { MovementsClient } from "./movements-client";

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  await requireAuthorizedUser();
  const initialData = await getMovements({ page: 1, pageSize: 50, sort: "date_desc" });

  return <main className="app-shell">
    <AppSidebar active="/movimientos" status="Origen protegido · edición trazable" />
    <section className="workspace movements-workspace">
      <header className="topbar movements-heading"><div><p className="eyebrow">MOVIMIENTOS · {initialData.version||"1.0.0-rc.1"}</p><h1>Movimientos</h1><p>Busca, filtra, revisa, divide y concilia sin modificar nunca el dato bancario original.</p></div><div className="topbar-actions"><Link className="ghost button-link" href="/movimientos/conciliacion">Conciliación</Link><Link className="ghost button-link" href="/">Volver al inicio</Link></div></header>
      <MovementsClient initialData={initialData} />
    </section>
  </main>;
}
