import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

export default async function SourceHealth() {
  if (!isGoogleSheetsConfigured()) {
    return (
      <section className="status-panel status-warning" aria-label="Estado de sincronización">
        <div>
          <div className="status-title">Fuente bancaria pendiente de conexión</div>
          <div className="status-copy">La aplicación está preparada para leer la hoja maestra en modo solo lectura.</div>
        </div>
        <span className="status-chip">Configuración necesaria</span>
      </section>
    );
  }

  try {
    const source = await loadValidatedSource();
    return (
      <section className="status-panel status-ok" aria-label="Estado de sincronización">
        <div>
          <div className="status-title">Fuente bancaria validada</div>
          <div className="status-copy">
            {source.rows.length.toLocaleString('es-ES')} movimientos · {source.accounts} cuentas · esquema de 22 columnas correcto.
          </div>
        </div>
        <span className="status-chip">Solo lectura</span>
      </section>
    );
  } catch {
    return (
      <section className="status-panel status-danger" aria-label="Estado de sincronización">
        <div>
          <div className="status-title">No se pudo validar la fuente</div>
          <div className="status-copy">Los datos financieros permanecen bloqueados hasta que la conexión sea válida.</div>
        </div>
        <span className="status-chip">Revisar conexión</span>
      </section>
    );
  }
}
