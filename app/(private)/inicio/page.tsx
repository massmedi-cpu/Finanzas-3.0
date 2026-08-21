import { formatMoney } from "@/lib/finance/format";

export default function InicioPage() {
  return (
    <section className="pageStack">
      <header className="pageHeader"><div><p className="eyebrow">Resumen financiero</p><h1>Inicio</h1><p>Tu situación financiera, sin ruido y con cifras trazables.</p></div></header>
      <div className="metricGrid">
        <article className="metricCard"><span>Cuenta corriente</span><strong>{formatMoney(0)}</strong><small>Pendiente de primera sincronización</small></article>
        <article className="metricCard"><span>Cuenta ahorro</span><strong>{formatMoney(0)}</strong><small>Excluida siempre de Cash Flow</small></article>
        <article className="metricCard featured"><span>Total disponible</span><strong>{formatMoney(0)}</strong><small>Se activará tras importar la fuente</small></article>
      </div>
      <div className="dashboardGrid">
        <article className="panel"><h2>Cash Flow</h2><p>El motor financiero ya bloquea cuenta ahorro, traspasos propios, duplicados y exclusiones manuales.</p></article>
        <article className="panel"><h2>Próximos pasos</h2><p>Conectar la base de datos aislada, completar Google OAuth y ejecutar la primera sincronización read-only.</p></article>
      </div>
    </section>
  );
}
