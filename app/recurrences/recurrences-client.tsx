"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// A 200 response is not enough to certify either a true empty set or safe
// decisions. Fail closed on malformed, incomplete or unexpected contracts.
function isRecurrenceSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const countsValid = Array.isArray(row.candidates)
    && Number.isSafeInteger(row.candidateCount)
    && row.candidateCount === row.candidates.length
    && Number.isSafeInteger(row.minOccurrences);
  const validDate = (date: unknown) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  if (row.contractVersion !== 1 || !countsValid || !validDate(row.dateTo)
    || (row.dateFrom !== null && !validDate(row.dateFrom))
    || (row.minOccurrences as number) < 3 || (row.minOccurrences as number) > 24) return false;
  const principles = row.principles as Record<string, unknown> | null;
  if (!principles || principles.bankSource !== "read_only" || principles.automaticPersistence !== false) return false;
  return (row.candidates as unknown[]).every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const c = item as Record<string, unknown>;
    return typeof c.candidateKey === "string" && /^[a-f0-9]{32}$/i.test(c.candidateKey)
      && typeof c.conceptPattern === "string"
      && ["high", "medium", "low"].includes(String(c.confidence))
      && ["income", "expense"].includes(String(c.kind))
      && ["high", "medium", "low"].includes(String(c.observedConfidence))
      && ["week", "month", "quarter", "year"].includes(String(c.intervalUnit))
      && Number.isSafeInteger(c.intervalCount) && (c.intervalCount as number) > 0
      && Number.isSafeInteger(c.usualAmountCents)
      && Number.isSafeInteger(c.amountToleranceCents) && (c.amountToleranceCents as number) >= 0
      && Number.isSafeInteger(c.dateToleranceDays) && (c.dateToleranceDays as number) >= 0
      && Number.isSafeInteger(c.occurrenceCount) && (c.occurrenceCount as number) >= 3
      && Number.isSafeInteger(c.missedCycles) && (c.missedCycles as number) >= 0
      && validDate(c.firstObservedDate)
      && validDate(c.lastObservedDate)
      && (c.nextEstimatedDate === null || validDate(c.nextEstimatedDate))
      && typeof c.stale === "boolean"
      && typeof c.explanation === "string"
      && (c.existingRecurrenceId === null || typeof c.existingRecurrenceId === "string")
      && (c.existingStatus === null || ["active", "ignored", "archived"].includes(String(c.existingStatus)));
  });
}

async function sendDecision(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/recurrences", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await parseResponse(response);
  } finally {
    clearTimeout(timeout);
  }
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

  const activeRead = useRef<AbortController | null>(null);
  const readSequence = useRef(0);
  const mutationInFlight = useRef(false);

  const load = useCallback(async (announce = false) => {
    const sequence = ++readSequence.current;
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setSnapshot(null);
    setError("");
    if (announce) { setMessage(""); setConfirmedImpact(null); }
    try {
      const response = await fetch("/api/recurrences?minOccurrences=3", {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await parseResponse(response);
      if (!isRecurrenceSnapshot(payload)) throw new Error("recurrence_contract_invalid");
      if (sequence !== readSequence.current || controller.signal.aborted) return false;
      setSnapshot(payload);
      if (announce) setMessage("Patrones recalculados con los movimientos actuales.");
      return true;
    } catch {
      if (sequence !== readSequence.current) return false;
      // Failed or malformed reads cannot be displayed as a genuine 0.
      setError("No se ha podido verificar el listado de patrones. Recalcula antes de tomar una decisión.");
      return false;
    } finally {
      clearTimeout(timeout);
      if (activeRead.current === controller) activeRead.current = null;
      if (sequence === readSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      readSequence.current += 1;
      activeRead.current?.abort();
    };
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
    if (mutationInFlight.current || loading) return;
    mutationInFlight.current = true;
    setPendingKey(candidate.candidateKey);
    setError("");
    setMessage("");
    try {
      const saved = await sendDecision("POST", {
        candidateKey: candidate.candidateKey,
        status,
        dateFrom: snapshot?.dateFrom ?? null,
        dateTo: snapshot?.dateTo ?? null,
        minOccurrences: snapshot?.minOccurrences ?? 3,
      });
      const recurrenceId = recurrenceIdFromResponse(saved)
        ?? recurrenceIdFromResponse({ id: candidate.existingRecurrenceId });
      if (!recurrenceId) throw new Error("recurrence_write_contract_invalid");
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
      setConfirmedImpact(null);
      setError("No podemos confirmar si la decisión se guardó. Recalcula patrones y comprueba su estado antes de repetirla.");
    } finally {
      mutationInFlight.current = false;
      setPendingKey(null);
    }
  }

  async function changeStatus(candidate: Candidate, status: RecurrenceStatus) {
    if (!candidate.existingRecurrenceId || mutationInFlight.current || loading) return;
    mutationInFlight.current = true;
    setPendingKey(candidate.candidateKey);
    setError("");
    setMessage("");
    try {
      await sendDecision("PATCH", { id: candidate.existingRecurrenceId, status });
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
      setConfirmedImpact(null);
      setError("No podemos confirmar si el estado cambió. Recalcula patrones y comprueba su estado antes de repetir la operación.");
    } finally {
      mutationInFlight.current = false;
      setPendingKey(null);
    }
  }

  const orderedCandidates = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 };
    const items = [...(snapshot?.candidates ?? [])].sort((left, right) =>
      rank[left.confidence] - rank[right.confidence]
      || right.lastObservedDate.localeCompare(left.lastObservedDate)
      || right.occurrenceCount - left.occurrenceCount
      || left.conceptPattern.localeCompare(right.conceptPattern, "es"),
    );
    return {
      current: items.filter((item) => !item.stale && item.missedCycles < 3),
      historical: items.filter((item) => item.stale || item.missedCycles >= 3),
    };
  }, [snapshot]);

  function renderCandidate(candidate: Candidate) {
                const pending = pendingKey === candidate.candidateKey;
                return (
                  <article className={styles.card} key={candidate.candidateKey}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardTitleWrap}>
                        <span className={`${styles.confidence} ${styles[candidate.confidence]}`}>
                          Confianza {confidenceLabel(candidate.confidence)}
                        </span>
                        {candidate.missedCycles > 0 ? (
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
                      <div><dt>Próxima fecha provisional</dt><dd>{date(candidate.nextEstimatedDate)}</dd></div>
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
                            disabled={loading || pendingKey !== null}
                            onClick={() => void persistCandidate(candidate, "active")}
                          >
                            {pending ? "Guardando…" : "Confirmar recurrencia"}
                          </button>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={loading || pendingKey !== null}
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
                              disabled={loading || pendingKey !== null}
                              onClick={() => void persistCandidate(candidate, "active")}
                            >
                              Reactivar y recalcular
                            </button>
                          ) : (
                            <>
                              <button
                                className={styles.primaryButton}
                                type="button"
                                disabled={loading || pendingKey !== null}
                                onClick={() => void persistCandidate(candidate, "active")}
                              >
                                Actualizar cálculo
                              </button>
                              <button
                                className={styles.secondaryButton}
                                type="button"
                                disabled={loading || pendingKey !== null}
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
                              disabled={loading || pendingKey !== null}
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

        <div className={styles.summaryGrid} role="group" aria-label="Resumen de confianza">
          <article className={styles.metric}>
            <span>Patrones detectados</span>
            <strong>{snapshot ? counts.total : "—"}</strong>
            <small>No se guardan automáticamente</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza alta</span>
            <strong>{snapshot ? counts.high : "—"}</strong>
            <small>Cadencia e importe estables</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza media</span>
            <strong>{snapshot ? counts.medium : "—"}</strong>
            <small>Conviene revisar antes de confirmar</small>
          </article>
          <article className={styles.metric}>
            <span>Confianza baja</span>
            <strong>{snapshot ? counts.low : "—"}</strong>
            <small>{snapshot ? `${counts.stale} con ciclos esperados no observados` : "Datos sin verificar"}</small>
          </article>
        </div>

        <section className={styles.panel} aria-labelledby="candidate-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="candidate-title">Candidatos encontrados</h2>
              <p>Primero confianza y última aparición. El historial con ciclos omitidos permanece disponible bajo demanda.</p>
            </div>
            <span className={styles.readOnlyBadge}>Origen bancario · solo lectura</span>
          </div>

          {!snapshot ? (
            <div className={styles.empty}>
              {loading ? "Analizando los movimientos…" : "No se puede confirmar cuántos patrones existen. Pulsa «Recalcular patrones» para reintentar la lectura."}
            </div>
          ) : snapshot.candidates.length ? (
            <div className={styles.candidateList}>
              {orderedCandidates.current.map(renderCandidate)}
              {orderedCandidates.historical.length > 0 ? (
                <details className={styles.historicalGroup}>
                  <summary>
                    Históricos · {orderedCandidates.historical.length} {orderedCandidates.historical.length === 1 ? "patrón" : "patrones"}
                    <span>No se incorporan a Previsión sin confirmación; próximas fechas provisionales</span>
                  </summary>
                  <div className={styles.candidateList}>{orderedCandidates.historical.map(renderCandidate)}</div>
                </details>
              ) : null}
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
