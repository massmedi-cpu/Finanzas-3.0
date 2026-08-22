import Image from "next/image";
import Link from "next/link";

const sections = [
  ["Inicio", "/"],
  ["Control", "/control"],
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
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <Link className="brand" href="/" aria-label="Financial App · Inicio">
        <Image className="brand-icon" src="/brand/isotipo.png" width={42} height={42} alt="" priority />
        <div><strong>Financial App</strong><small>Control financiero personal</small></div>
      </Link>
      <nav aria-label="Navegación principal">
        {sections.map(([label, href]) => {
          const current = active === href;
          return <Link key={href} className={current ? "active" : ""} href={href} aria-current={current ? "page" : undefined}>{label}</Link>;
        })}
      </nav>
      <div className="sidebar-foot" role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" /> <span>{status}</span></div>
    </aside>
  );
}
