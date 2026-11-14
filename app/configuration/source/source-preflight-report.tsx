import type { OfficialSourcePreflightSummary } from "../../../src/application/source-preflight";
import { formatInteger } from "../../../src/core/formatters";
import { formatMoneyCents } from "../../../src/core/money";
import styles from "./source.module.css";

export function SourcePreflightReport({ summary }: { summary: OfficialSourcePreflightSummary }) {
  return (
    <div className={styles.preflightBlock} role="region" aria-label="Prevalidación de la fuente bancaria">
      <div className="panel-heading">
        <div><p className="panel-kicker">COMPROBACIÓN SIN IMPORTAR</p><h3>Fuente comprobada antes de importar</h3></div>
        <span className="status-chip">Solo lectura</span>
      </div>
      <p>Se ha leído el archivo original. Esta comprobación no incorpora ni modifica movimientos.</p>
      <dl className={styles.metrics}>
        <div><dt>Movimientos</dt><dd>{formatInteger(summary.totalAuthoritativeRows)}</dd></div>
        <div><dt>Productos</dt><dd>{formatInteger(summary.accounts.length)}</dd></div>
        <div><dt>Pestañas</dt><dd>{formatInteger(summary.cursors.length)}</dd></div>
      </dl>
      <div className={styles.preflightProducts}>
        {summary.accounts.map((account) => {
          const continuity = account.balanceContinuity;
          return (
            <article key={account.accountExternalKey}>
              <span>{account.lifecycle === "archived" ? "Archivada" : "Activa"}</span>
              <strong>{account.accountName}</strong>
              <small>{formatInteger(account.authoritativeRows)} {account.authoritativeRows === 1 ? "movimiento" : "movimientos"} · saldo inicial {formatMoneyCents(account.openingBalanceCents)}</small>
              <small>Saldo de la fila más reciente: {account.latestBalanceAfterCents === null ? "Sin saldo en origen" : formatMoneyCents(account.latestBalanceAfterCents)}</small>
              <p>
                {continuity.comparablePairs > 0
                  ? `${formatInteger(continuity.consistentPairs)} de ${formatInteger(continuity.comparablePairs)} enlaces entre saldos coinciden al céntimo.`
                  : "No hay pares de saldos consecutivos que se puedan comprobar."}
              </p>
              {continuity.discontinuousPairs > 0 && (
                <p className="config-message warning" role="status">
                  {formatInteger(continuity.discontinuousPairs)} {continuity.discontinuousPairs === 1 ? "enlace no encadena" : "enlaces no encadenan"} con el importe del movimiento.
                  {" "}Puede existir una discontinuidad del histórico; este control no demuestra que falten movimientos y no corrige el original.
                </p>
              )}
              {continuity.unverifiablePairs > 0 && (
                <small>{formatInteger(continuity.unverifiablePairs)} {continuity.unverifiablePairs === 1 ? "par sin saldo suficiente" : "pares sin saldos suficientes"} para comprobar. Los saldos ausentes se conservan como desconocidos.</small>
              )}
            </article>
          );
        })}
      </div>
      <p>La coincidencia aritmética no acredita por sí sola la cobertura completa del extracto ni la conciliación con los movimientos guardados.</p>
    </div>
  );
}
