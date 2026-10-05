"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import {
  buildForecastHorizonSummary,
  forecastHorizonEndDate,
  type ForecastHorizon,
} from "../../src/application/forecast/forecast-horizon-engine";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./forecast-horizon-panel.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const ORIGIN_LABELS = {
  known: "conocidos",
  recurring: "recurrentes",
  budget: "presupuesto",
  manual: "manuales",
  inferred: "inferidos",
} as const;

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function originSummary(horizon: ForecastHorizon) {
  return Object.entries(horizon.originCounts)
    .filter(([, count]) => count > 0)
    .map(([origin, count]) => `${count} ${ORIGIN_LABELS[origin as keyof typeof ORIGIN_LABELS]}`)
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
          Confianza {horizon.confidenceLabel}{horizon.projectedItems > 0 ? ` · ${horizon.confidenceScore}%` : ""}
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
          ? `${horizon.projectedItems} previsiones que afectan al flujo${origins ? `: ${origins}` : ""}.`
          : "Sin movimientos previstos que afecten al flujo en este horizonte."}
      </p>
    </article>
  );
}

export function ForecastHorizonPanel({
  dateFrom,
  accountId,
}: {
  dateFrom: string;
  accountId: string | null;
}) {
  const [snapshot, setSnapshot] = useState<ForecastSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const dateTo = useMemo(() => forecastHorizonEndDate(dateFrom), [dateFrom]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (accountId) params.set("accountId", accountId);
        const response = await fetch(`/api/forecast?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("forecast_horizon_unavailable");
        const data = await response.json() as ForecastSnapshot;
        if (!controller.signal.aborted) setSnapshot(data);
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accountId, dateFrom, dateTo]);

  const summary = useMemo(
    () => snapshot ? buildForecastHorizonSummary(snapshot) : null,
    [snapshot],
  );

  return (
    <section className={styles.section} aria-labelledby="forecast-horizons-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CASH FLOW · FASE 7</p>
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
          No se han podido calcular ahora los horizontes. La previsión detallada sigue disponible debajo.
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
