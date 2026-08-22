import Image from "next/image";
import Link from "next/link";

const sections = [
  ["Inicio", "/"],
  ["Cuentas", "/cuentas"],
  ["Movimientos", "/movimientos"],
  ["Cash Flow", "/cash-flow"],
  ["Presupuesto", "/presupuesto"],
  ["Objetivos", "/objetivos"],
  ["Previsión", "/prevision"],
  ["Patrimonio", "/patrimonio"],
  ["Análisis", "/analisis"],
  ["Archivo", "/archivo"],
  ["Configuración", "/configuracion"],
] as const;

export function AppSidebar({ active, status = "Datos reales · fuente solo lectura" }: { active: string; status?: string }) {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Financial App · Inicio">
        <Image className="brand-icon" src="/brand/isotipo.png" width={42} height={42} alt="" priority />
        <div><strong>Financial App</strong><small>Control financiero personal</small></div>
      </Link>
      <nav aria-label="Navegación principal">
        {sections.map(([label, href]) => <Link key={href} className={active === href ? "active" : ""} href={href}>{label}</Link>)}
      </nav>
      <div className="sidebar-foot"><span className="status-dot" /> {status}</div>
    </aside>
  );
}
