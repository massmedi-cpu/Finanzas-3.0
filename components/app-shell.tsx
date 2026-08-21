import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/version";

const nav = [
  ["Inicio", "/inicio"], ["Cuentas", "/cuentas"], ["Movimientos", "/movimientos"],
  ["Cash Flow", "/cash-flow"], ["Presupuesto", "/presupuesto"], ["Previsión", "/prevision"],
  ["Patrimonio", "/patrimonio"], ["Análisis", "/analisis"], ["Archivo", "/archivo"],
  ["Configuración", "/configuracion"],
] as const;

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  return (
    <div className="appGrid">
      <aside className="sidebar">
        <div><div className="brandMark">F</div><strong>{APP_NAME}</strong></div>
        <nav aria-label="Navegación principal">
          {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="sidebarFooter"><small>Sesión segura</small><span>{email}</span></div>
      </aside>
      <main className="mainContent">{children}</main>
    </div>
  );
}
