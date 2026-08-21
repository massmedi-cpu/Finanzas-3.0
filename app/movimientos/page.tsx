import Link from "next/link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getMovements } from "@/lib/financial/movements";
import { MovementsClient } from "./movements-client";

const sections = [["Inicio","/"],["Cuentas","/cuentas"],["Movimientos","/movimientos"],["Cash Flow","/cash-flow"],["Presupuesto","/presupuesto"],["Previsión","/prevision"],["Patrimonio","/patrimonio"],["Análisis","/analisis"],["Archivo","/archivo"],["Configuración","/configuracion"]] as const;

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  await requireAuthorizedUser();
  const initialData = await getMovements({ page: 1, pageSize: 50, sort: "date_desc" });

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">F</span><div><strong>Financial App</strong><small>Control financiero personal</small></div></div>
      <nav aria-label="Navegación principal">{sections.map(([label,href])=><Link key={href} className={href==="/movimientos"?"active":""} href={href}>{label}</Link>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> Origen protegido · edición trazable</div>
    </aside>
    <section className="workspace movements-workspace">
      <header className="topbar movements-heading"><div><p className="eyebrow">MOVIMIENTOS · 0.3.0</p><h1>Movimientos</h1><p>Busca, filtra, revisa y corrige sin modificar nunca el dato bancario original.</p></div><Link className="ghost button-link" href="/">Volver al inicio</Link></header>
      <MovementsClient initialData={initialData} />
    </section>
  </main>;
}
