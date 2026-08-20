'use client';

import { useMemo, useState } from 'react';

export interface MovementView {
  id: string;
  date: string;
  account: string;
  type: string;
  category: string;
  subcategory: string;
  concept: string;
  merchant: string;
  amount: number | null;
  balance: number | null;
  channel: string;
  reconciled: string;
  review: string;
}

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function normalize(value: string): string {
  return value.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isReview(value: string): boolean {
  const normalized = normalize(value.trim());
  return normalized === 'si' || normalized === 'yes' || normalized === 'true';
}

export default function MovementsExplorer({ rows }: { rows: MovementView[] }) {
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');

  const accounts = useMemo(
    () => [...new Set(rows.map((row) => row.account).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());

    return rows.filter((row) => {
      if (account !== 'all' && row.account !== account) return false;
      if (status === 'review' && !isReview(row.review)) return false;
      if (status === 'ok' && isReview(row.review)) return false;

      if (!needle) return true;
      const haystack = normalize([
        row.date,
        row.account,
        row.type,
        row.category,
        row.subcategory,
        row.concept,
        row.merchant,
        row.channel,
        row.amount === null ? '' : String(row.amount).replace('.', ','),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [account, query, rows, status]);

  return (
    <>
      <div className="toolbar">
        <input
          className="control search"
          aria-label="Buscar movimientos"
          placeholder="Buscar concepto, comercio, importe o categoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="control" aria-label="Filtrar por cuenta" value={account} onChange={(event) => setAccount(event.target.value)}>
          <option value="all">Todas las cuentas</option>
          {accounts.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
        <select className="control" aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="review">Pendientes de revisar</option>
          <option value="ok">Sin revisión pendiente</option>
        </select>
      </div>

      <section className="card table-card">
        <div className="row table-summary-row">
          <div>
            <div className="row-title">Movimientos</div>
            <div className="row-meta">{filtered.length.toLocaleString('es-ES')} de {rows.length.toLocaleString('es-ES')} operaciones</div>
          </div>
          <span className="badge">Fuente protegida</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty section-gap">No hay movimientos que coincidan con los filtros.</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Cuenta</th>
                  <th className="numeric">Importe</th>
                  <th className="numeric">Saldo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id || `${row.date}-${row.account}-${row.concept}-${row.amount}`}>
                    <td className="date-cell">{row.date}</td>
                    <td>
                      <div className="table-primary">{row.merchant || row.concept || 'Sin concepto'}</div>
                      <div className="table-secondary">{row.merchant && row.concept !== row.merchant ? row.concept : row.channel}</div>
                    </td>
                    <td>
                      <div className="table-primary">{row.category || 'Sin categoría'}</div>
                      <div className="table-secondary">{row.subcategory}</div>
                    </td>
                    <td>{row.account}</td>
                    <td className={`numeric amount ${row.amount !== null && row.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {row.amount === null ? '—' : euro.format(row.amount)}
                    </td>
                    <td className="numeric">{row.balance === null ? '—' : euro.format(row.balance)}</td>
                    <td>{isReview(row.review) ? <span className="state state-review">Revisar</span> : <span className="state state-ok">Correcto</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
