import Link from 'next/link';
import {
  compareYears,
  getAvailableYears,
  getCategoryReport,
  getMonthlyReportForYear,
  getQuarterlyReport,
  getYearlyReport,
  type YearComparison,
} from '../../src/domain/report-engine';
import { getPrivateState } from '../../src/private-data/client';
import { rowsForBudgetAndReports } from '../../src/private-data/merge';
import { getMovementSplits } from '../../src/private-data/splits';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { APP_VERSION_LABEL } from '../../src/version';
import CashFlowChart from './CashFlowChart';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function deltaLabel(value: number | null, positiveIsGood = true): { text: string; className: string } {
  if (value === null) return { text: 'Sin comparación', className: '' };
  const sign = value > 0 ? '+' : '';
  const good = positiveIsGood ? value >= 0 : value <= 0;
  return { text: `${sign}${percent.format(value)}%`, className: good ? 'amount-positive' : 'amount-negative' };
}

export default async function InformesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams;
  let availableYears: string[] = [];
  let selectedYear = '';
  let monthly: ReturnType<typeof getMonthlyReportForYear> = [];
  let quarterly: ReturnType<typeof getQuarterlyReport> = [];
  let categories: ReturnType<typeof getCategoryReport> = [];
  let yearly: ReturnType<typeof getYearlyReport> | null = null;
  let comparison: YearComparison | null = null;
  let previousYear = '';
  let dataError = false;
  let splitCount = 0;

  if (isGoogleSheetsConfigured()) {
    try {
      const [source, privateState, splits] = await Promise.all([
        loadValidatedSource(),
        getPrivateState(),
        getMovementSplits(),
      ]);
      splitCount = new Set(splits.map((split) => split.source_id)).size;
      const rows = rowsForBudgetAndReports(source.rows, privateState.overrides, splits);
      availableYears = getAvailableYears(rows);
      selectedYear = params.year && availableYears.includes(params.year) ? params.year : (availableYears[0] || '');

      if (selectedYear) {
        monthly = getMonthlyReportForYear(rows, selectedYear);
        quarterly = getQuarterlyReport(rows, selectedYear);
        categories = getCategoryReport(rows, selectedYear, 10);
        yearly = getYearlyReport(rows, selectedYear);

        const index = availableYears.indexOf(selectedYear);
        previousYear = index >= 0 ? (availableYears[index + 1] || '') : '';
        if (previousYear) {
          const throughMonth = monthly.at(-1)?.month.slice(5, 7) || '12';
          const previousComparableRows = rows.filter((row) => row.date.startsWith(`${previousYear}-`) && row.date.slice(5, 7) <= throughMonth);
          const previousComparable = getYearlyReport(previousComparableRows, previousYear);
          comparison = compareYears(yearly, previousComparable);
        }
      }
    } catch {
      dataError = true;
    }
  }

  const incomeDelta = comparison ? deltaLabel(comparison.incomeDeltaPct, true) : null;
  const expenseDelta = comparison ? deltaLabel(comparison.expensesDeltaPct, false) : null;
  const maxCategory = Math.max(1, ...categories.map((item) => item.amount));

  return (
    <main className="page">
      <section className="page-header report-header">
        <div>
          <div className="eyebrow">Informes</div>
          <h1>Entiende cómo evoluciona tu dinero</h1>
          <p className="subtitle">Cash flow mensual, acumulado, trimestres y categorías sobre movimientos reales. Traspasos y exclusiones internas quedan fuera del análisis; las compras divididas se imputan a sus categorías correctas.</p>
        </div>
        {selectedYear && <span className="badge">{APP_VERSION_LABEL} · {selectedYear}</span>}
      </section>

      {dataError ? (
        <div className="status-panel status-danger"><div><div className="status-title">No se han podido generar los informes con garantías</div><div className="status-copy">Se detiene el informe si falta la fuente, tus ajustes privados o las divisiones de movimientos.</div></div></div>
      ) : !yearly ? (
        <section className="card"><div className="empty">Los informes se activarán al conectar el histórico bancario.</div></section>
      ) : (
        <>
          <nav className="year-selector" aria-label="Seleccionar año del informe">
            {availableYears.map((year) => (
              <Link key={year} href={`/informes?year=${year}`} prefetch={false} className={`year-chip${year === selectedYear ? ' year-chip-active' : ''}`}>{year}</Link>
            ))}
            {splitCount > 0 && <span className="badge">{splitCount} movimientos divididos aplicados</span>}
          </nav>

          <section className="grid grid-4">
            <article className="card"><div className="metric-label">Ingresos {selectedYear}</div><div className="metric-value amount-positive">{euro.format(yearly.income)}</div><p className="metric-note">{incomeDelta && previousYear ? <><span className={incomeDelta.className}>{incomeDelta.text}</span> frente a {previousYear} hasta el mismo mes</> : 'Ingresos netos de traspasos'}</p></article>
            <article className="card"><div className="metric-label">Gastos {selectedYear}</div><div className="metric-value amount-negative">{euro.format(yearly.expenses)}</div><p className="metric-note">{expenseDelta && previousYear ? <><span className={expenseDelta.className}>{expenseDelta.text}</span> frente a {previousYear} hasta el mismo mes</> : 'Gasto real acumulado'}</p></article>
            <article className="card"><div className="metric-label">Cash flow {selectedYear}</div><div className={`metric-value ${yearly.net < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(yearly.net)}</div><p className="metric-note">{comparison ? `${comparison.netDelta >= 0 ? '+' : ''}${euro.format(comparison.netDelta)} frente a ${previousYear}` : 'Ingresos menos gastos'}</p></article>
            <article className="card"><div className="metric-label">Tasa de ahorro</div><div className={`metric-value ${yearly.savingsRate < 0 ? 'amount-negative' : 'amount-positive'}`}>{percent.format(yearly.savingsRate)}%</div><p className="metric-note">{yearly.transactions} movimientos · {yearly.transfersExcluded} traspasos excluidos</p></article>
          </section>

          <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Cash flow anual conciliado</div><h2 className="section-title">Ingresos, gastos y acumulado por mes</h2></div><span className="badge">{monthly.length} meses con datos</span></div><CashFlowChart rows={monthly} /></section>

          <section className="grid grid-4 section-gap">
            {quarterly.map((item) => <article className="card quarter-card" key={item.quarter}><div className="card-heading-row"><div className="metric-label">{item.quarter}</div><span className="row-meta">{item.transactions ? `${item.transactions} mov.` : 'Sin datos'}</span></div>{item.transactions ? <><div className={`quarter-net ${item.net < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(item.net)}</div><div className="quarter-meta"><span>Ingresos <strong>{euro.format(item.income)}</strong></span><span>Gastos <strong>{euro.format(item.expenses)}</strong></span></div></> : <div className="quarter-empty">—</div>}</article>)}
          </section>

          <section className="grid grid-2 section-gap">
            <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Gasto por categoría</div><h2 className="section-title">Dónde se va el dinero</h2></div><span className="badge">Top {categories.length}</span></div>{categories.length === 0 ? <div className="empty compact-empty">No hay gastos categorizados en este periodo.</div> : <div className="category-report-list">{categories.map((item) => <div className="category-report-row" key={item.category}><div className="category-report-head"><div><div className="row-title">{item.category}</div><div className="row-meta">{item.transactions} imputaciones · {percent.format(item.share)}%</div></div><strong>{euro.format(item.amount)}</strong></div><div className="progress"><span style={{ width: `${Math.max(2, (item.amount / maxCategory) * 100)}%` }} /></div></div>)}</div>}</article>
            <article className="card table-card"><div className="card-heading-row"><div><div className="eyebrow">Detalle mensual</div><h2 className="section-title">Mes a mes</h2></div><span className="badge">{selectedYear}</span></div><div className="table-scroll"><table className="data-table report-table"><thead><tr><th>Mes</th><th className="numeric">Ingresos</th><th className="numeric">Gastos</th><th className="numeric">Cash flow</th><th className="numeric">Acumulado</th></tr></thead><tbody>{monthly.map((item) => <tr key={item.month}><td className="table-primary">{item.month}</td><td className="numeric amount-positive">{euro.format(item.income)}</td><td className="numeric amount-negative">{euro.format(item.expenses)}</td><td className={`numeric amount ${item.net < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(item.net)}</td><td className={`numeric amount ${item.cumulativeNet < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(item.cumulativeNet)}</td></tr>)}</tbody></table></div></article>
          </section>
        </>
      )}
    </main>
  );
}
