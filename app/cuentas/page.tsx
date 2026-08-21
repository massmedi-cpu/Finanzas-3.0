import { getNormalizedState, type NormalizedAccountOption } from '../../src/normalized/client';

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function balanceOf(account: NormalizedAccountOption) {
  const value = Number(account.balance);
  return Number.isFinite(value) ? value : 0;
}

export default async function CuentasPage() {
  let accounts: NormalizedAccountOption[] = [];
  let sourceError = false;

  try {
    const state = await getNormalizedState();
    if (!state.inSync || state.currentRows !== state.normalizedRows) throw new Error('normalized-source-not-ready');
    accounts = (state.accounts || []).filter((account) => account.balance !== null && Number.isFinite(Number(account.balance)));
  } catch {
    sourceError = true;
  }

  const total = accounts.reduce((sum, account) => sum + balanceOf(account), 0);

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Cuentas</div>
          <h1>Todo tu dinero, por cuenta</h1>
          <p className="subtitle">Último saldo conocido de cada producto, leído desde el modelo normalizado sin cargar todo el histórico.</p>
        </div>
        {accounts.length > 0 && <span className="badge">{accounts.length} cuentas</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se han podido validar las cuentas</div>
            <div className="status-copy">No se muestran saldos parciales mientras el snapshot y la capa normalizada no coincidan.</div>
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
              <p className="metric-note">Consultados sin recorrer miles de movimientos</p>
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
                <div className="row" key={account.accountKey}>
                  <div>
                    <div className="row-title">{account.name}</div>
                    <div className="row-meta">
                      {[account.institution, account.type, account.balanceDate ? `Actualizado ${account.balanceDate}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="amount">{euro.format(balanceOf(account))}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
