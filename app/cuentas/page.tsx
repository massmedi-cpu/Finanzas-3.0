import { getLatestAccountBalances } from '../../src/domain/finance-engine';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

export default async function CuentasPage() {
  let accounts: ReturnType<typeof getLatestAccountBalances> = [];
  let sourceError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      accounts = getLatestAccountBalances(source.rows);
    } catch {
      sourceError = true;
    }
  }

  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Cuentas</div>
          <h1>Todo tu dinero, por cuenta</h1>
          <p className="subtitle">Último saldo conocido de cada producto, calculado desde la fuente maestra sin alterar el histórico.</p>
        </div>
        {accounts.length > 0 && <span className="badge">{accounts.length} cuentas</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se han podido validar las cuentas</div>
            <div className="status-copy">No se muestran saldos parciales mientras exista un error en la fuente.</div>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <section className="card">
          <div className="empty">Las cuentas y saldos aparecerán automáticamente al conectar la fuente bancaria.</div>
        </section>
      ) : (
        <>
          <section className="grid grid-3">
            <article className="card">
              <div className="metric-label">Saldo total conocido</div>
              <div className="metric-value">{euro.format(total)}</div>
              <p className="metric-note">Suma de los últimos saldos disponibles</p>
            </article>
            <article className="card">
              <div className="metric-label">Productos con saldo</div>
              <div className="metric-value">{accounts.length}</div>
              <p className="metric-note">Detectados en la fuente</p>
            </article>
            <article className="card">
              <div className="metric-label">Fuente</div>
              <div className="metric-value metric-value-small">Solo lectura</div>
              <p className="metric-note">El original nunca se modifica</p>
            </article>
          </section>

          <section className="card section-gap">
            <h2 className="section-title">Detalle de cuentas</h2>
            <div className="stack">
              {accounts.map((account) => (
                <div className="row" key={account.identifier || account.account}>
                  <div>
                    <div className="row-title">{account.account}</div>
                    <div className="row-meta">
                      {[account.institution, account.identifier, `Actualizado ${account.date}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="amount">{euro.format(account.balance)}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
