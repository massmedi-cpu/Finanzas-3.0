"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isForecastSnapshotForSelection,
  type ForecastSnapshot,
} from "../../src/application/forecast/forecast-contract";
import {
  buildForecastHorizonSummary,
  forecastHorizonEndDate,
  type ForecastHorizon,
} from "../../src/application/forecast/forecast-horizon-engine";
import { formatMoneyCents } from "../../src/core/money";
import { formatNumber, formatPercentage } from "../../src/core/formatters";
import styles from "./forecast-horizon-panel.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const ORIGIN_LABELS = {
  known: ["conocido", "conocidos"],
  recurring: ["recurrente", "recurrentes"],
  budget: ["de presupuesto", "de presupuesto"],
  manual: ["manual", "manuales"],
  inferred: ["inferido", "inferidos"],
} as const;

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function originSummary(horizon: ForecastHorizon) {
  return Object.entries(horizon.originCounts)
    .filter(([, count]) => count > 0)
    .map(([origin, count]) => `${formatNumber(count)} ${ORIGIN_LABELS[origin as keyof typeof ORIGIN_LABELS][count === 1 ? 0 : 1]}`)
    .join(" · ");
}

function HorizonCard({ horizon }: { horizon: ForecastHorizon }) {
  const positive = horizon.projectedNetCents >= 0;
  const origins = originSummary(horizon);
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.horizonLabel}>{horizon.label}</p>
          <p className={styles.horizonDate}>Hasta {formatDate(horizon.date)}</p>
        </div>
        <span className={styles.confidence} data-level={horizon.confidenceLabel.toLowerCase()}>
          Confianza {horizon.confidenceLabel}{horizon.projectedItems > 0 ? ` · ${formatPercentage(horizon.confidenceScore / 100, 0)}` : ""}
        </span>
      </div>

      <div className={styles.balanceBlock}>
        <span>Saldo proyectado</span>
        <strong>{formatMoneyCents(horizon.projectedBalanceCents)}</strong>
        <small className={positive ? styles.positive : styles.negative}>
          Flujo {positive ? "+" : ""}{formatMoneyCents(horizon.projectedNetCents)}
        </small>
      </div>

      <dl className={styles.metrics}>
        <div><dt>Cobros</dt><dd>{formatMoneyCents(horizon.projectedIncomeCents)}</dd></div>
        <div><dt>Pagos</dt><dd>{formatMoneyCents(horizon.projectedExpenseCents)}</dd></div>
      </dl>

      <p className={styles.explain}>
        {horizon.projectedItems > 0
          ? `${formatNumber(horizon.projectedItems)} ${horizon.projectedItems === 1 ? "previsión que afecta" : "previsiones que afectan"} al flujo${origins ? `: ${origins}` : ""}.`
          : "Sin movimientos previstos que afecten al flujo en este horizonte."}
      </p>
    </article>
  );
}

export function ForecastHorizonPanel({
  sourceSnapshot,
}: {
  sourceSnapshot: ForecastSnapshot;
}) {
  const { dateFrom, accountId } = sourceSnapshot.period;
  const [result, setResult] = useState<{
    source: ForecastSnapshot;
    snapshot: ForecastSnapshot | null;
    failed: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const dateTo = useMemo(() => forecastHorizonEndDate(dateFrom), [dateFrom]);
  // A verified long-range snapshot already contains all four horizons.
  // Reuse it instead of repeating the same expensive gateway query.
  const coveredBySource = sourceSnapshot.period.dateTo >= dateTo;

  useEffect(() => {
    if (coveredBySource) return;
    const controller = new AbortController();
    const load = async () => {
      setResult(null);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (accountId) params.set("accountId", accountId);
        const response = await fetch(`/api/forecast?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("forecast_horizon_unavailable");
        const data: unknown = await response.json();
        if (!isForecastSnapshotForSelection(data, { dateFrom, dateTo, accountId })) {
          throw new Error("forecast_horizon_invalid_contract");
        }
        if (!controller.signal.aborted) setResult({ source: sourceSnapshot, snapshot: data, failed: false });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ source: sourceSnapshot, snapshot: null, failed: true });
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [sourceSnapshot, coveredBySource, accountId, dateFrom, dateTo, retry]);

  // Key results to the exact verified detail snapshot. No old balance is
  // visible between a period change/save and the effect starting its reload.
  const currentResult = result?.source === sourceSnapshot ? result : null;
  const snapshot = coveredBySource ? sourceSnapshot : currentResult?.snapshot ?? null;
  const loading = !coveredBySource && currentResult === null;
  const error = !coveredBySource && currentResult?.failed === true;

  const summary = useMemo(
    () => snapshot ? buildForecastHorizonSummary(snapshot) : null,
    [snapshot],
  );

  // Without dated events there is no meaningful risk/horizon assessment.
  // Suppress repeated neutral cards; the owner page explains missing evidence.
  if (!loading && summary && summary.horizons.every((item) => item.projectedItems === 0)) return null;

  return (
    <section className={styles.section} aria-labelledby="forecast-horizons-title" data-testid="forecast-horizons" aria-busy={loading || undefined}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CASH FLOW · HORIZONTES</p>
          <h2 id="forecast-horizons-title">Tu dinero en cuatro horizontes</h2>
          <p>
            Cobros, pagos, flujo y saldo calculados desde el mismo motor de Previsión, sin contar dos veces movimientos confirmados o excluidos.
          </p>
        </div>
        {summary ? (
          <div className={styles.openingBalance}>
            <span>Saldo de partida</span>
            <strong>{formatMoneyCents(summary.openingBalanceCents)}</strong>
            <small>{formatDate(summary.dateFrom)}</small>
          </div>
        ) : null}
      </div>

      {loading ? <div className={styles.status}>Calculando horizontes financieros…</div> : null}
      {!loading && error ? (
        <div className={styles.status} role="status">
          <p>No se han podido verificar los horizontes del periodo y la cuenta elegidos. Puedes consultar la previsión detallada y volver a intentar la lectura.</p>
          <button className={styles.retryButton} onClick={() => { setResult(null); setRetry((value) => value + 1); }}>
            Reintentar horizontes
          </button>
        </div>
      ) : null}
      {!loading && summary ? (
        <div className={styles.grid}>
          {summary.horizons.map((horizon) => <HorizonCard key={horizon.key} horizon={horizon} />)}
        </div>
      ) : null}
    </section>
  );
}
