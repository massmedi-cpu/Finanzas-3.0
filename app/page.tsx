import Link from "next/link";

const sections = [
  ["Inicio", "/"], ["Cuentas", "/cuentas"], ["Movimientos", "/movimientos"],
  ["Cash Flow", "/cash-flow"], ["Presupuesto", "/presupuesto"], ["Previsión", "/prevision"],
  ["Patrimonio", "/patrimonio"], ["Análisis", "/analisis"], ["Archivo", "/archivo"],
  ["Configuración", "/configuracion"],
] as const;

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><div><strong>Financial App</strong><small>Control financiero personal</small></div></div>
        <nav>{sections.map(([label, href]) => <Link key={href} className={href === "/" ? "active" : ""} href={href}>{label}</Link>)}</nav>
        <div className="sidebar-foot"><span className="status-dot" /> Fuente conectada · solo lectura</div>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><p className="eyebrow">INICIO</p><h1>Tu situación financiera</h1><p>Vista rápida del presente, el histórico y lo que viene.</p></div><button className="ghost">Actualizar datos</button></header>

        <div className="account-grid">
          <article className="account-card primary"><div><span>Cuenta corriente</span><small>Openbank · 3967</small></div><strong>{money.format(1263.2)}</strong><p>Operativa · incluida en Cash Flow</p></article>
          <article className="account-card"><div><span>Cuenta ahorro</span><small>Openbank · 2504</small></div><strong>{money.format(186222.05)}</strong><p>Ahorro · excluida del Cash Flow</p></article>
          <article className="account-card total"><div><span>Total disponible</span><small>Patrimonio financiero</small></div><strong>{money.format(187485.25)}</strong><p>2 cuentas activas</p></article>
        </div>

        <div className="metric-grid">
          <article><span>Ingresos del mes</span><strong>—</strong><small>Se calcularán desde la base operativa</small></article>
          <article><span>Gastos del mes</span><strong>—</strong><small>Sin ahorro ni entrecuentas</small></article>
          <article><span>Cash Flow</span><strong>—</strong><small>Ingresos reales − gastos reales</small></article>
          <article><span>Próximos cargos</span><strong>—</strong><small>Motor de previsión pendiente de activar</small></article>
        </div>

        <div className="content-grid">
          <article className="panel"><div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Saldo y patrimonio</h2></div><span className="pill">Histórico</span></div><div className="chart-placeholder"><div className="chart-line" /><span>La visualización se conectará a los datos importados de Supabase.</span></div></article>
          <article className="panel"><div className="panel-head"><div><p className="eyebrow">CONTROL</p><h2>Estado del sistema</h2></div></div><ul className="health-list"><li><b>Fuente</b><span>Google Sheets · solo lectura</span></li><li><b>Base operativa</b><span>PostgreSQL / Supabase</span></li><li><b>Cash Flow ahorro</b><span>Excluido por regla central</span></li><li><b>Versión</b><span>0.1.0 · Foundation</span></li></ul></article>
        </div>
      </section>
    </main>
  );
}
