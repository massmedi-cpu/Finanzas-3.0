import { buildForecast, detectRecurringPatterns, projectedNetChange } from '../../src/domain/forecast-engine';
import { getNetWorthFromKnownBalances } from '../../src/domain/finance-engine';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function PrevisionPage() {
  let sourceError = false;
  let baseDate: string | null = null;
  let knownBalance = 0;
  let patterns: ReturnType<typeof detectRecurringPatterns> = [];
  let forecast: ReturnType<typeof buildForecast> = [];

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      baseDate = source.rows.reduce<string>((latest, row) => (row.date > latest ? row.date : latest), '');
      knownBalance = getNetWorthFromKnownBalances(source.rows);
      patterns = detectRecurringPatterns(source.rows);
      forecast = baseDate ? buildForecast(patterns, baseDate, 365) : [];
    } catch {
      sourceError = true;
    }
  }

  const horizons = baseDate
    ? [
        ['30 días', addDays(baseDate, 30)],
        ['6 meses', addDays(baseDate, 183)],
        ['12 meses', addDays(baseDate, 365)],
      ] as const
    : [];

  const upcoming = forecast.slice(0, 12);

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Previsión</div>
          <h1>Anticipa los próximos meses</h1>
          <p className="subtitle">La previsión se construye a partir de recurrencias observadas en movimientos reales; no se inventan cargos ni ingresos futuros.</p>
        </div>
        {patterns.length > 0 && <span className="badge">{patterns.length} recurrencias detectadas</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se puede calcular una previsión segura</div>
            <div className="status-copy">La previsión queda bloqueada hasta validar de nuevo la fuente.</div>
          </div>
        </div>
      ) : !baseDate ? (
        <section className="card"><div className="empty">La previsión se activará cuando exista histórico bancario sincronizado.</div></section>
      ) : (
        <>
          <section className="grid grid-3">
            {horizons.map(([label, date]) => {
              const projected = knownBalance + projectedNetChange(forecast, date);
              return (
                <article className="card" key={label}>
                  <div className="metric-label">Saldo conocido proyectado · {label}</div>
                  <div className="metric-value">{euro.format(projected)}</div>
                  <p className="metric-note">Hasta {date} · basado en recurrencias detectadas</p>
                </article>
              );
            })}
          </section>

          <section className="grid grid-2 section-gap">
            <article className="card">
              <div className="card-heading-row">
                <div>
                  <div className="eyebrow">Calendario financiero</div>
                  <h2 className="section-title">Próximos movimientos esperados</h2>
                </div>
              </div>
              {upcoming.length === 0 ? (
                <div className="empty compact-empty">No hay recurrencias suficientemente fiables todavía.</div>
              ) : (
                <div className="stack">
                  {upcoming.map((movement) => (
                    <div className="row" key={movement.id}>
                      <div>
                        <div className="row-title">{movement.description}</div>
                        <div className="row-meta">{movement.expectedDate} · {movement.category || 'Sin categoría'} · confianza {Math.round(movement.confidence * 100)}%</div>
                      </div>
                      <div className={`amount ${movement.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(movement.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="card">
              <div className="eyebrow">Modelo</div>
              <h2 className="section-title">Cómo se está calculando</h2>
              <div className="stack">
                <div className="row"><div><div className="row-title">Recurrencias mensuales</div><div className="row-meta">Se exigen al menos tres apariciones y una frecuencia compatible.</div></div><strong>{patterns.length}</strong></div>
                <div className="row"><div><div className="row-title">Traspasos</div><div className="row-meta">No se consideran ingreso ni gasto en la previsión.</div></div><span className="state state-ok">Excluidos</span></div>
                <div className="row"><div><div className="row-title">Horizonte</div><div className="row-meta">Proyección de hasta doce meses desde el último dato real.</div></div><strong>365 días</strong></div>
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
