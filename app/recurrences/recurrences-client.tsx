"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoneyCents as money } from "../../src/core/money";
import {
  forecastHrefForContext,
  forecastImpactHref,
  recurrenceIdFromResponse,
  type ForecastRecurrenceContext,
} from "../../src/application/forecast/recurrence-flow";
import styles from "./recurrences.module.css";

type RecurrenceStatus = "active" | "ignored" | "archived";
type Confidence = "high" | "medium" | "low";

type Candidate = {
  candidateKey: string;
  accountId: string | null;
  merchantId: string | null;
  categoryId: string | null;
  kind: "income" | "expense";
  conceptPattern: string;
  intervalUnit: "week" | "month" | "quarter" | "year";
  intervalCount: number;
  usualAmountCents: number;
  amountToleranceCents: number;
  dateToleranceDays: number;
  confidence: Confidence;
  observedConfidence: Confidence;
  occurrenceCount: number;
  firstObservedDate: string;
  lastObservedDate: string;
  nextEstimatedDate: string | null;
  missedCycles: number;
  stale: boolean;
  existingRecurrenceId: string | null;
  existingStatus: RecurrenceStatus | null;
  explanation: string;
};

type Snapshot = {
  contractVersion: number;
  dateFrom: string | null;
  dateTo: string;
  minOccurrences: number;
  candidateCount: number;
  candidates: Candidate[];
  principles: {
    bankSource: string;
    factSource: string;
    automaticPersistence: boolean;
    confidenceExplicit: boolean;
    weakMatchesBecomeFacts: boolean;
    nextDateAfterAnalysisPeriod: boolean;
    missedCyclesReduceConfidence: boolean;
  };
};

type ConfirmedImpact = {
  recurrenceId: string;
  concept: string;
  href: string;
  periodExtended: boolean;
  accountScopeChanged: boolean;
};

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function date(value: string | null) {
  if (!value) return "—";
  return shortDate.format(new Date(`${value}T00:00:00Z`));
}

function confidenceLabel(value: Confidence) {
  if (value === "high") return "Alta";
  if (value === "medium") return "Media";
  return "Baja";
}

function cadenceLabel(unit: Candidate["intervalUnit"], count: number) {
  if (unit === "week") return count === 1 ? "Semanal" : `Cada ${count} semanas`;
  if (unit === "month") return count === 1 ? "Mensual" : `Cada ${count} meses`;
  if (unit === "quarter") return count === 1 ? "Trimestral" : `Cada ${count} trimestres`;
  return count === 1 ? "Anual" : `Cada ${count} años`;
}

async function parseResponse(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const row = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    throw new Error(typeof row.code === "string" ? row.code : "recurrence_request_failed");
  }
  return payload;
}

export default function RecurrencesClient({
  forecastContext = null,
}: {
  forecastContext?: ForecastRecurrenceContext | null;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmedImpact, setConfirmedImpact] = useState<ConfirmedImpact | null>(null);

  const load = useCallback(async (announce = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recurrences?minOccurrences=3", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await parseResponse(response) as Snapshot;
      setSnapshot(payload);
      if (announce) setMessage("Patrones recalculados con los movimientos actuales.");
    } catch {
      setError("No se han podido cargar los patrones recurrentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const counts = useMemo(() => {
    const rows = snapshot?.candidates ?? [];
    return {
      total: rows.length,
      high: rows.filter((row) => row.confidence === "high").length,
      medium: rows.filter((row) => row.confidence === "medium").length,
      low: rows.filter((row) => row.confidence === "low").length,
      stale: rows.filter((row) => row.stale).length,
    };
  }, [snapshot]);

  async function persistCandidate(candidate: Candidate, status: RecurrenceStatus) {
    setPendingKey(candidate.candidateKey);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/recurrences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateKey: candidate.candidateKey,
          status,
          dateFrom: snapshot?.dateFrom ?? null,
          dateTo: snapshot?.dateTo ?? null,
          minOccurrences: snapshot?.minOccurrences ?? 3,
        }),
      });
      const saved = await parseResponse(response);
      const recurrenceId = recurrenceIdFromResponse(saved)
        ?? recurrenceIdFromResponse({ id: candidate.existingRecurrenceId });
      setMessage(
        status === "active"
          ? candidate.existingStatus === "active"
            ? "Recurrencia actualizada con los movimientos actuales."
            : "Recurrencia confirmada."
          : "Patrón ignorado.",
      );
      if (status === "active" && forecastContext && recurrenceId) {
        const href = forecastImpactHref(forecastContext, candidate, recurrenceId);
        const impactUrl = new URL(href, "https://financial-app.local");
        setConfirmedImpact({
          recurrenceId,
          concept: candidate.conceptPattern,
          href,
          periodExtended: impactUrl.searchParams.get("dateTo") !== forecastContext.dateTo,
          accountScopeChanged: impactUrl.searchParams.get("accountId") !== forecastContext.accountId,
        });
      } else {
        setConfirmedImpact(null);
      }
      await load(false);
    } catch {
      setError("No se ha podido guardar la decisión sobre este patrón.");
    } finally {
      setPendingKey(null);
    }
  }

  async function changeStatus(candidate: Candidate, status: RecurrenceStatus) {
    if (!candidate.existingRecurrenceId) return;
    setPendingKey(candidate.candidateKey);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/recurrences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: candidate.existingRecurrenceId, status }),
      });
      await parseResponse(response);
      setMessage(
        status === "ignored"
          ? "Recurrencia ignorada."
          : "Recurrencia archivada.",
      );
      if (confirmedImpact?.recurrenceId === candidate.existingRecurrenceId) {
        setConfirmedImpact(null);
      }
      await load(false);
    } catch {
      setError("No se ha podido cambiar el estado de la recurrencia.");
    } finally {
      setPendingKey(null);
    }
  }

  const forecastHref = forecastContext ? forecastHrefForContext(forecastContext) : "/forecast";

  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="recurrences-title">
        <div>
          <Link prefetch={false} href="/" className={styles.backLink}>← Inicio</Link>
          <p className={styles.eyebrow}>RECURRENTES</p>
          <h1 id="recurrences-title">Patrones que se repiten, sin adivinar</h1>
          <p className={styles.heroText}>
            Financial App detecta movimientos que se repiten y muestra el grado de confianza.
            Ningún patrón se confirma como recurrencia sin una decisión explícita.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link prefetch={false} className={styles.secondaryButton} href={forecastHref}>
            Abrir Previsión
          </Link>
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => void load(true)}
            disabled={loading || pendingKey !== null}
          >
            {loading ? "Analizando…" : "Recalcular patrones"}
          </button>
        </div>
      </section>

      <section className={styles.content}>
        {forecastContext ? (
          <section className={styles.forecastContext} aria-labelledby="forecast-context-title">
            <div>
              <p className={styles.contextEyebrow}>PREVISIÓN → RECURRENTES</p>
              <h2 id="forecast-context-title">Revisa el patrón sin perder tu horizonte</h2>
              <p>
                Has llegado desde la previsión del {date(forecastContext.dateFrom)} al {date(forecastContext.dateTo)}.
                {forecastContext.accountId ? " Se conservará la cuenta seleccionada cuando corresponda." : " El periodo incluye todas tus cuentas."}
              </p>
            </div>
            <Link prefetch={false} className={styles.contextLink} href={forecastHref}>
              Volver sin actualizar
            </Link>
          </section>
        ) : null}

        {error ? <div className={styles.alert} role="alert">{error}</div> : null}
        {message ? (
          <div className={styles.notice} role="status">
            <div className={styles.noticeCopy}>
              <strong>{message}</strong>
              {confirmedImpact ? (
                <p>
                  “{confirmedImpact.concept}” está lista para regenerar el calendario y destacar su impacto futuro.
                  {confirmedImpact.periodExtended ? " El horizonte se ampliará hasta incluir su próxima fecha." : ""}
                  {confirmedImpact.accountScopeChanged ? " Se abrirá la cuenta asociada a este patrón para no ocultar su impacto." : ""}
                </p>
              ) : null}
            </div>
            {confirmedImpact ? (
              <Link prefetch={false} className={styles.impactLink} href={confirmedImpact.href}>
                Actualizar y ver impacto en Previsión
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className={styles.summaryGrid} aria-label="Resumen de confianza">
          <article className={styles.metric}>
            <span>Patrones detectados</span>
            <strong>{counts.total}</strong>
            <small>No se guardan automáticamente</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza alta</span>
            <strong>{counts.high}</strong>
            <small>Cadencia e importe estables</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza media</span>
            <strong>{counts.medium}</strong>
            <small>Conviene revisar antes de confirmar</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza baja</span>
            <strong>{counts.low}</strong>
            <small>{counts.stale} con ciclos esperados no observados</small>
          </article>
        </div>

        <section className={styles.panel} aria-labelledby="candidate-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="candidate-title">Candidatos encontrados</h2>
              <p>Ordenados por confianza, vigencia y número de apariciones.</p>
            </div>
            <span className={styles.readOnlyBadge}>Origen bancario · solo lectura</span>
          </div>

          {loading && !snapshot ? (
            <div className={styles.empty}>Analizando los movimientos…</div>
          ) : snapshot?.candidates.length ? (
            <div className={styles.candidateList}>
              {snapshot.candidates.map((candidate) => {
                const pending = pendingKey === candidate.candidateKey;
                return (
                  <article className={styles.card} key={candidate.candidateKey}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardTitleWrap}>
                        <span className={`${styles.confidence} ${styles[candidate.confidence]}`}>
                          Confianza {confidenceLabel(candidate.confidence)}
                        </span>
                        {candidate.stale ? (
                          <span className={styles.statusBadge}>
                            {candidate.missedCycles} ciclo{candidate.missedCycles === 1 ? "" : "s"} no observado{candidate.missedCycles === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {candidate.existingStatus ? (
                          <span className={styles.statusBadge}>Estado · {candidate.existingStatus}</span>
                        ) : null}
                        <h3>{candidate.conceptPattern}</h3>
                      </div>
                      <strong className={candidate.kind === "expense" ? styles.expense : styles.income}>
                        {money(candidate.usualAmountCents)}
                      </strong>
                    </div>

                    <dl className={styles.details}>
                      <div><dt>Cadencia</dt><dd>{cadenceLabel(candidate.intervalUnit, candidate.intervalCount)}</dd></div>
                      <div><dt>Apariciones</dt><dd>{candidate.occurrenceCount}</dd></div>
                      <div><dt>Próxima fecha</dt><dd>{date(candidate.nextEstimatedDate)}</dd></div>
                      <div><dt>Ciclos no observados</dt><dd>{candidate.missedCycles}</dd></div>
                      <div><dt>Tolerancia fecha</dt><dd>± {candidate.dateToleranceDays} días</dd></div>
                      <div><dt>Tolerancia importe</dt><dd>± {money(candidate.amountToleranceCents)}</dd></div>
                      <div><dt>Último movimiento</dt><dd>{date(candidate.lastObservedDate)}</dd></div>
                    </dl>

                    <p className={styles.explanation}>{candidate.explanation}</p>

                    <div className={styles.actions}>
                      {!candidate.existingStatus ? (
                        <>
                          <button
                            className={styles.primaryButton}
                            type="button"
                            disabled={pending}
                            onClick={() => void persistCandidate(candidate, "active")}
                          >
                            {pending ? "Guardando…" : "Confirmar recurrencia"}
                          </button>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={pending}
                            onClick={() => void persistCandidate(candidate, "ignored")}
                          >
                            Ignorar patrón
                          </button>
                        </>
                      ) : (
                        <>
                          {candidate.existingStatus !== "active" ? (
                            <button
                              className={styles.primaryButton}
                              type="button"
                              disabled={pending}
                              onClick={() => void persistCandidate(candidate, "active")}
                            >
                              Reactivar y recalcular
                            </button>
                          ) : (
                            <>
                              <button
                                className={styles.primaryButton}
                                type="button"
                                disabled={pending}
                                onClick={() => void persistCandidate(candidate, "active")}
                              >
                                Actualizar cálculo
                              </button>
                              <button
                                className={styles.secondaryButton}
                                type="button"
                                disabled={pending}
                                onClick={() => void changeStatus(candidate, "ignored")}
                              >
                                Ignorar
                              </button>
                            </>
                          )}
                          {candidate.existingStatus !== "archived" ? (
                            <button
                              className={styles.textButton}
                              type="button"
                              disabled={pending}
                              onClick={() => void changeStatus(candidate, "archived")}
                            >
                              Archivar
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              No hay patrones con al menos {snapshot?.minOccurrences ?? 3} apariciones y una cadencia reconocible.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
