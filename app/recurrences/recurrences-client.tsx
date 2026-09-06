"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  occurrenceCount: number;
  firstObservedDate: string;
  lastObservedDate: string;
  nextEstimatedDate: string | null;
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
  };
};

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function money(cents: number) {
  return euro.format(cents / 100);
}

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

export default function RecurrencesClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      if (announce) setMessage("Patrones recalculados sobre el histórico efectivo actual.");
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
          id: candidate.existingRecurrenceId,
          accountId: candidate.accountId,
          merchantId: candidate.merchantId,
          categoryId: candidate.categoryId,
          conceptPattern: candidate.conceptPattern,
          status,
          intervalUnit: candidate.intervalUnit,
          intervalCount: candidate.intervalCount,
          usualAmountCents: candidate.usualAmountCents,
          amountToleranceCents: candidate.amountToleranceCents,
          dateToleranceDays: candidate.dateToleranceDays,
          nextEstimatedDate: candidate.nextEstimatedDate,
          confidence: candidate.confidence,
          occurrenceCount: candidate.occurrenceCount,
          lastObservedDate: candidate.lastObservedDate,
        }),
      });
      await parseResponse(response);
      setMessage(status === "active" ? "Recurrencia confirmada." : "Patrón ignorado.");
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
        status === "active"
          ? "Recurrencia reactivada."
          : status === "ignored"
            ? "Recurrencia ignorada."
            : "Recurrencia archivada.",
      );
      await load(false);
    } catch {
      setError("No se ha podido cambiar el estado de la recurrencia.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="recurrences-title">
        <div>
          <Link href="/" className={styles.backLink}>← Volver a Inicio</Link>
          <p className={styles.eyebrow}>Fase 7 · Recurrentes</p>
          <h1 id="recurrences-title">Patrones que se repiten, sin adivinar</h1>
          <p className={styles.heroText}>
            Financial App detecta cadencias sobre movimientos efectivos y muestra su confianza.
            Ningún patrón se convierte en recurrencia confirmada sin una decisión explícita.
          </p>
        </div>
        <button
          className={styles.actionButton}
          type="button"
          onClick={() => void load(true)}
          disabled={loading || pendingKey !== null}
        >
          {loading ? "Analizando…" : "Recalcular patrones"}
        </button>
      </section>

      <section className={styles.content}>
        {error ? <div className={styles.alert} role="alert">{error}</div> : null}
        {message ? <div className={styles.notice} role="status">{message}</div> : null}

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
            <small>Nunca se trata como certeza</small>
          </article>
        </div>

        <section className={styles.panel} aria-labelledby="candidate-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="candidate-title">Candidatos encontrados</h2>
              <p>Ordenados por confianza y número de apariciones.</p>
            </div>
            <span className={styles.readOnlyBadge}>Origen bancario · solo lectura</span>
          </div>

          {loading && !snapshot ? (
            <div className={styles.empty}>Analizando el histórico efectivo…</div>
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
                              onClick={() => void changeStatus(candidate, "active")}
                            >
                              Reactivar
                            </button>
                          ) : (
                            <button
                              className={styles.secondaryButton}
                              type="button"
                              disabled={pending}
                              onClick={() => void changeStatus(candidate, "ignored")}
                            >
                              Ignorar
                            </button>
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
