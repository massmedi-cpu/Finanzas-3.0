import type { PublicSourcePostflightReport } from "../../../src/domain/source-postflight-reconciliation";
import { formatInteger } from "../../../src/core/formatters";
import styles from "./source.module.css";

/** Aggregated counts only; no source row identifiers, values or concepts. */
export function SourcePostflightReportPanel({ report }: { report: PublicSourcePostflightReport }) {
  const label = report.status === "verified"
    ? "Coinciden los datos comprobados"
    : report.status === "pending"
      ? "Hay movimientos pendientes de incorporar"
      : "Hay diferencias que requieren revisión";
  return (
    <section className={styles.preflightBlock} role="region" aria-label="Conciliación con los movimientos guardados">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">CONCILIACIÓN DE SOLO LECTURA</p>
          <h3>{label}</h3>
        </div>
        <span className="status-chip">Sin modificar datos</span>
      </div>
      <p>Se han comparado los movimientos del archivo con los registros guardados.
        No se ha importado, revisado ni corregido ningún movimiento.</p>
      <dl className={styles.metrics}>
        <div><dt>En Google</dt><dd>{formatInteger(report.sourceRows)}</dd></div>
        <div><dt>Guardados</dt><dd>{formatInteger(report.persistedRows)}</dd></div>
        <div><dt>Coincidentes</dt><dd>{formatInteger(report.matchingRows)}</dd></div>
        <div><dt>Pendientes</dt><dd>{formatInteger(report.pendingRows)}</dd></div>
        <div><dt>Con diferencias</dt><dd>{formatInteger(report.differingRows)}</dd></div>
        <div><dt>Sin origen localizado</dt><dd>{formatInteger(report.orphanRows)}</dd></div>
      </dl>
      <div className={styles.preflightProducts}>
        {report.accounts.map((account) => (
          <article key={account.accountLabel}>
            <strong>{account.accountLabel}</strong>
            <small>{formatInteger(account.matchingRows)} coincidentes · {formatInteger(account.pendingRows)} pendientes</small>
            {(account.differingRows > 0 || account.orphanRows > 0) && (
              <p role="status" className="config-message warning">
                {formatInteger(account.differingRows)} con diferencias y {formatInteger(account.orphanRows)} sin origen localizado.
              </p>
            )}
          </article>
        ))}
      </div>
      {report.status === "blocked" && (
        <p className="config-message warning" role="status">
          No se puede certificar la conciliación hasta investigar las diferencias. No se corregirá ningún registro automáticamente.
        </p>
      )}
      {report.matchingUnknownBalances > 0 && (
        <p>{formatInteger(report.matchingUnknownBalances)} saldos desconocidos se han conservado sin convertirlos en cero.</p>
      )}
      <p>El resultado corresponde a dos lecturas consecutivas, no a una transacción atómica entre Google y la base de datos.
        No demuestra que no se hayan producido cambios después de la comprobación.</p>
    </section>
  );
}
