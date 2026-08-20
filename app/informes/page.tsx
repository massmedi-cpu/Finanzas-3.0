import { getMonthlyReport, getYearlyReport } from '../../src/domain/report-engine';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default async function InformesPage() {
  let monthly: ReturnType<typeof getMonthlyReport> = [];
  let yearly: ReturnType<typeof getYearlyReport> | null = null;
  let sourceError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      monthly = getMonthlyReport(source.rows, 12);
      const year = monthly[0]?.month.slice(0, 4);
      yearly = year ? getYearlyReport(source.rows, year) : null;
    } catch {
      sourceError = true;
    }
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Informes</div>
          <h1>Entiende cómo evoluciona tu dinero</h1>
          <p className="subtitle">Resumen mensual y anual calculado sobre movimientos reales, con traspasos internos excluidos del cash flow.</p>
        </div>
        {yearly && <span className="badge">Año {yearly.year}</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div><div className="status-title">No se han podido generar los informes</div><div className="status-copy">Se evita mostrar un informe parcial o incoherente.</div></div>
        </div>
      ) : !yearly ? (
        <section className="card"><div className="empty">Los informes se activarán al conectar el histórico bancario.</div></section>
      ) : (
        <>
          <section className="grid grid-4">
            <article className="card"><div className="metric-label">Ingresos {yearly.year}</div><div className="metric-value">{euro.format(yearly.income)}</div><p className="metric-note">Ingresos netos de traspasos</p></article>
            <article className="card"><div className="metric-label">Gastos {yearly.year}</div><div className="metric-value">{euro.format(yearly.expenses)}</div><p className="metric-note">Gasto real acumulado</p></article>
            <article className="card"><div className="metric-label">Cash flow {yearly.year}</div><div className={`metric-value ${yearly.net < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(yearly.net)}</div><p className="metric-note">Ingresos menos gastos</p></article>
            <article className="card"><div className="metric-label">Traspasos excluidos</div><div className="metric-value">{yearly.transfersExcluded}</div><p className="metric-note">No distorsionan el resultado</p></article>
          </section>

          <section className="card section-gap table-card">
            <h2 className="section-title">Últimos 12 meses disponibles</h2>
            <div className="table-scroll">
              <table className="data-table report-table">
                <thead><tr><th>Mes</th><th className="numeric">Ingresos</th><th className="numeric">Gastos</th><th className="numeric">Cash flow</th><th className="numeric">Movimientos</th></tr></thead>
                <tbody>
                  {monthly.map((item) => (
                    <tr key={item.month}>
                      <td className="table-primary">{item.month}</td>
                      <td className="numeric amount-positive">{euro.format(item.income)}</td>
                      <td className="numeric amount-negative">{euro.format(item.expenses)}</td>
                      <td className={`numeric amount ${item.net < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(item.net)}</td>
                      <td className="numeric">{item.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
