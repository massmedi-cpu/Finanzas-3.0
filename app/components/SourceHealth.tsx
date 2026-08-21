import { getNormalizedState } from '../../src/normalized/client';

export default async function SourceHealth() {
  try {
    const state = await getNormalizedState();
    if (!state.inSync || state.currentRows !== state.normalizedRows) throw new Error('normalized-source-not-ready');

    return (
      <section className="status-panel status-ok" aria-label="Estado de sincronización">
        <div>
          <div className="status-title">Fuente bancaria validada y normalizada</div>
          <div className="status-copy">
            {state.normalizedRows.toLocaleString('es-ES')} movimientos · {state.accounts.length} cuentas · snapshot y modelo SQL sincronizados.
          </div>
        </div>
        <span className="status-chip">Solo lectura</span>
      </section>
    );
  } catch {
    return (
      <section className="status-panel status-danger" aria-label="Estado de sincronización">
        <div>
          <div className="status-title">No se pudo validar la fuente normalizada</div>
          <div className="status-copy">Los datos financieros permanecen bloqueados hasta que el snapshot y el modelo SQL vuelvan a coincidir.</div>
        </div>
        <span className="status-chip">Revisar conexión</span>
      </section>
    );
  }
}
