"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./forecast.module.css";

type ForecastItem = {
  id: string;
  date: string;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  concept: string;
  amountCents: number;
  origin: "known" | "recurring" | "budget" | "manual" | "inferred";
  confidence: "high" | "medium" | "low";
  recurrenceId: string | null;
  budgetId: string | null;
  confirmedTransactionId: string | null;
  excluded: boolean;
  excludedReason: string;
  reconciliationNote: string;
  projectionKey: string | null;
  status: "planned" | "excluded" | "confirmed";
  affectsProjection: boolean;
  projectionEffectCents: number;
  projectedBalanceAfterCents: number;
  actual: null | {
    date: string;
    amountCents: number;
    accountId: string;
    categoryId: string | null;
    merchantId: string | null;
    analyticsEligible: boolean;
  };
};

type ForecastSnapshot = {
  contractVersion: number;
  period: { dateFrom: string; dateTo: string; accountId: string | null };
  summary: {
    openingBalanceCents: number;
    projectedIncomeCents: number;
    projectedExpenseCents: number;
    projectedNetCents: number;
    projectedClosingBalanceCents: number;
    plannedItems: number;
    excludedItems: number;
    confirmedItems: number;
  };
  items: ForecastItem[];
  budgetContext: Array<{
    month: string;
    budgetCents: number;
    actualExpenseCents: number;
    remainingCents: number;
    status: string;
  }>;
  balanceContext: {
    quality: {
      accounts: number;
      integrityDeltaAccounts: number;
      explicitBalanceAccounts: number;
      reconstructedBalanceAccounts: number;
    };
    accounts: Array<{
      id: string;
      name: string;
      balanceCents: number;
      balanceSource: string;
      explicitBalanceDate: string | null;
      reconstructionDeltaCents: number;
    }>;
  };
  principles: {
    bankSource: string;
    openingBalanceSource: string;
    recurrenceSource: string;
    budgetsCreateDatedItems: boolean;
    excludedItemsAffectCashFlow: boolean;
    confirmedItemsAffectCashFlow: boolean;
    getHasSideEffects: boolean;
  };
};

type Candidate = {
  transactionId: string;
  date: string;
  amountCents: number;
  differenceCents: number;
  dayDifference: number;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  concept: string;
};

type CandidateSnapshot = {
  forecastItemId: string;
  forecastDate: string;
  forecastAmountCents: number;
  days: number;
  candidates: Candidate[];
};

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function formatMonth(month: string) {
  return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

function parseEuroToCents(input: string) {
  const compact = input.trim().replace(/\s/g, "");
  if (!compact) return null;

  let normalized: string;
  if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = compact.match(/\./g)?.length ?? 0;
    if (dots === 1 && /^\d+\.\d{1,2}$/.test(compact)) normalized = compact;
    else normalized = compact.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [units, decimals = ""] = normalized.split(".");
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function statusLabel(status: ForecastItem["status"]) {
  if (status === "confirmed") return "Confirmado";
  if (status === "excluded") return "Excluido";
  return "Previsto";
}

function originLabel(origin: ForecastItem["origin"]) {
  const labels: Record<ForecastItem["origin"], string> = {
    known: "Conocido",
    recurring: "Recurrente",
    budget: "Presupuesto",
    manual: "Manual",
    inferred: "Inferido",
  };
  return labels[origin];
}

function confidenceLabel(confidence: ForecastItem["confidence"]) {
  return confidence === "high" ? "Alta" : confidence === "medium" ? "Media" : "Baja";
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : typeof body?.error === "string" ? body.error : "request_failed";
    throw new Error(code);
  }
  return body;
}

export function ForecastClient() {
  const today = useMemo(() => madridToday(), []);
  const initialFrom = useMemo(() => addDays(today, 1), [today]);
  const initialTo = useMemo(() => addDays(today, 90), [today]);

  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const dateFromRef = useRef(initialFrom);
  const dateToRef = useRef(initialTo);
  const loadSequence = useRef(0);
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;

  const [snapshot, setSnapshot] = useState<ForecastSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(initialFrom);
  const [manualConcept, setManualConcept] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualKind, setManualKind] = useState<"expense" | "income">("expense");
  const [manualConfidence, setManualConfidence] = useState<"high" | "medium" | "low">("high");
  const [excludeReasons, setExcludeReasons] = useState<Record<string, string>>({});
  const [candidateFor, setCandidateFor] = useState<string | null>(null);
  const [candidateData, setCandidateData] = useState<CandidateSnapshot | null>(null);

  const loadSnapshot = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const requestedFrom = dateFromRef.current;
    const requestedTo = dateToRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom: requestedFrom, dateTo: requestedTo });
      const data = await readJson(await fetch(`/api/forecast?${params.toString()}`, { cache: "no-store" }));
      if (sequence !== loadSequence.current) return;
      setSnapshot(data as ForecastSnapshot);
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      setError(err instanceof Error ? err.message : "No se pudo cargar la previsión");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [dateFrom, dateTo, loadSnapshot]);

  async function runMutation(key: string, task: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await task();
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La operación no se ha podido completar");
    } finally {
      setBusy(null);
    }
  }

  async function refreshRecurring() {
    await runMutation("refresh", async () => {
      const result = await readJson(await fetch("/api/forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "refresh",
          dateFrom: dateFromRef.current,
          dateTo: dateToRef.current,
          accountId: null,
        }),
      }));
      setNotice(`Recurrencias actualizadas: ${result.generated ?? 0} fechas previstas.`);
    });
  }

  async function createManual(event: FormEvent) {
    event.preventDefault();
    const absoluteCents = parseEuroToCents(manualAmount);
    if (absoluteCents === null || absoluteCents <= 0) {
      setError("Introduce un importe válido con hasta dos decimales.");
      return;
    }
    if (!manualConcept.trim()) {
      setError("Escribe un concepto para la previsión manual.");
      return;
    }

    await runMutation("manual", async () => {
      await readJson(await fetch("/api/forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "manual",
          date: manualDate,
          concept: manualConcept.trim(),
          amountCents: manualKind === "expense" ? -absoluteCents : absoluteCents,
          accountId: null,
          categoryId: null,
          merchantId: null,
          confidence: manualConfidence,
        }),
      }));
      setManualConcept("");
      setManualAmount("");
      setNotice("Previsión manual añadida.");
    });
  }

  async function toggleExcluded(item: ForecastItem) {
    const nextExcluded = !item.excluded;
    const reason = nextExcluded ? (excludeReasons[item.id] ?? "").trim() : "";
    if (nextExcluded && !reason) {
      setError("Indica el motivo antes de excluir un elemento previsto.");
      return;
    }

    await runMutation(`exclude:${item.id}`, async () => {
      await readJson(await fetch("/api/forecast", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exclude", id: item.id, excluded: nextExcluded, reason }),
      }));
      setNotice(nextExcluded ? "Elemento excluido del cash flow previsto." : "Elemento restaurado en la previsión.");
    });
  }

  async function loadCandidates(item: ForecastItem) {
    setCandidateFor(item.id);
    setCandidateData(null);
    setBusy(`candidates:${item.id}`);
    setError(null);
    try {
      const params = new URLSearchParams({ itemId: item.id, days: "7", limit: "8" });
      const data = await readJson(await fetch(`/api/forecast?${params.toString()}`, { cache: "no-store" }));
      setCandidateData(data as CandidateSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron buscar movimientos reales");
      setCandidateFor(null);
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(item: ForecastItem, transactionId: string | null) {
    await runMutation(`reconcile:${item.id}`, async () => {
      await readJson(await fetch("/api/forecast", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reconcile",
          id: item.id,
          transactionId,
          note: transactionId ? "Conciliado desde Previsión" : "",
        }),
      }));
      setCandidateFor(null);
      setCandidateData(null);
      setNotice(transactionId ? "Previsión conciliada con el movimiento real." : "Conciliación eliminada.");
    });
  }

  const items = snapshot?.items ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FINANCIAL APP · FASE 8</p>
          <h1>Previsión</h1>
          <p className={styles.lead}>
            Calendario financiero futuro con cash flow estimado, recurrencias confirmadas y conciliación contra movimientos reales.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/" className={styles.secondaryButton}>Inicio</Link>
          <Link href="/recurrences" className={styles.secondaryButton}>Recurrentes</Link>
          <button className={styles.primaryButton} onClick={() => void refreshRecurring()} disabled={busy !== null}>
            {busy === "refresh" ? "Actualizando…" : "Actualizar recurrentes"}
          </button>
        </div>
      </header>

      <section className={styles.controls} aria-label="Periodo de previsión">
        <label>
          Desde
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <button className={styles.secondaryButton} onClick={() => void loadSnapshot()} disabled={loading || busy !== null}>
          Aplicar periodo
        </button>
      </section>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

      {loading && !snapshot ? (
        <section className={styles.loading} aria-live="polite">Cargando previsión financiera…</section>
      ) : snapshot ? (
        <>
          <section className={styles.kpis} aria-label="Resumen de previsión">
            <article><span>Saldo de partida</span><strong>{money.format(snapshot.summary.openingBalanceCents / 100)}</strong></article>
            <article><span>Ingresos previstos</span><strong>{money.format(snapshot.summary.projectedIncomeCents / 100)}</strong></article>
            <article><span>Gastos previstos</span><strong>{money.format(snapshot.summary.projectedExpenseCents / 100)}</strong></article>
            <article className={snapshot.summary.projectedNetCents < 0 ? styles.negativeKpi : styles.positiveKpi}>
              <span>Saldo proyectado</span><strong>{money.format(snapshot.summary.projectedClosingBalanceCents / 100)}</strong>
              <small>Neto {money.format(snapshot.summary.projectedNetCents / 100)}</small>
            </article>
          </section>

          <section className={styles.mainGrid}>
            <div className={styles.timelinePanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.eyebrow}>CALENDARIO FUTURO</p>
                  <h2>Movimientos previstos</h2>
                </div>
                <div className={styles.counts}>
                  <span>{snapshot.summary.plannedItems} previstos</span>
                  <span>{snapshot.summary.confirmedItems} confirmados</span>
                  <span>{snapshot.summary.excludedItems} excluidos</span>
                </div>
              </div>

              {items.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No hay cargos ni ingresos previstos en este periodo.</strong>
                  <p>No se inventan movimientos. Añade uno manual o confirma recurrencias reales para generar fechas futuras.</p>
                </div>
              ) : (
                <div className={styles.timeline}>
                  {items.map((item) => (
                    <article key={item.id} className={`${styles.itemCard} ${styles[item.status]}`}>
                      <div className={styles.itemDate}>
                        <span>{formatDate(item.date)}</span>
                        <small>{originLabel(item.origin)} · confianza {confidenceLabel(item.confidence)}</small>
                      </div>
                      <div className={styles.itemMain}>
                        <div className={styles.itemTitleRow}>
                          <h3>{item.concept}</h3>
                          <strong className={item.amountCents < 0 ? styles.outflow : styles.inflow}>
                            {money.format(item.amountCents / 100)}
                          </strong>
                        </div>
                        <div className={styles.itemMeta}>
                          <span className={styles.statusPill}>{statusLabel(item.status)}</span>
                          {item.accountName ? <span>{item.accountName}</span> : <span>Todas las cuentas</span>}
                          {item.categoryName ? <span>{item.categoryName}</span> : null}
                          {item.merchantName ? <span>{item.merchantName}</span> : null}
                        </div>
                        {item.affectsProjection ? (
                          <p className={styles.balanceLine}>Saldo después: <strong>{money.format(item.projectedBalanceAfterCents / 100)}</strong></p>
                        ) : null}
                        {item.excluded && item.excludedReason ? <p className={styles.reason}>Motivo: {item.excludedReason}</p> : null}
                        {item.confirmedTransactionId && item.actual ? (
                          <p className={styles.confirmedLine}>
                            Movimiento real: {formatDate(item.actual.date)} · {money.format(item.actual.amountCents / 100)}
                          </p>
                        ) : null}

                        <div className={styles.itemActions}>
                          {item.status !== "confirmed" ? (
                            <>
                              {!item.excluded ? (
                                <input
                                  className={styles.reasonInput}
                                  placeholder="Motivo para excluir"
                                  value={excludeReasons[item.id] ?? ""}
                                  onChange={(event) => setExcludeReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                                  aria-label={`Motivo para excluir ${item.concept}`}
                                />
                              ) : null}
                              <button
                                className={styles.ghostButton}
                                onClick={() => void toggleExcluded(item)}
                                disabled={busy !== null}
                              >
                                {item.excluded ? "Restaurar" : "Excluir"}
                              </button>
                            </>
                          ) : null}

                          {item.status === "planned" ? (
                            <button
                              className={styles.ghostButton}
                              onClick={() => void loadCandidates(item)}
                              disabled={busy !== null}
                            >
                              {busy === `candidates:${item.id}` ? "Buscando…" : "Buscar movimiento real"}
                            </button>
                          ) : null}

                          {item.status === "confirmed" ? (
                            <button
                              className={styles.ghostButton}
                              onClick={() => void reconcile(item, null)}
                              disabled={busy !== null}
                            >
                              Desvincular movimiento
                            </button>
                          ) : null}
                        </div>

                        {candidateFor === item.id ? (
                          <div className={styles.candidates}>
                            <div className={styles.candidateHeader}>
                              <strong>Candidatos reales ±7 días</strong>
                              <button className={styles.textButton} onClick={() => { setCandidateFor(null); setCandidateData(null); }}>Cerrar</button>
                            </div>
                            {candidateData?.candidates.length ? candidateData.candidates.map((candidate) => (
                              <div key={candidate.transactionId} className={styles.candidateRow}>
                                <div>
                                  <strong>{candidate.concept || "Movimiento bancario"}</strong>
                                  <small>{formatDate(candidate.date)} · diferencia {money.format(candidate.differenceCents / 100)}</small>
                                </div>
                                <span>{money.format(candidate.amountCents / 100)}</span>
                                <button className={styles.primarySmall} onClick={() => void reconcile(item, candidate.transactionId)} disabled={busy !== null}>
                                  Conciliar
                                </button>
                              </div>
                            )) : (
                              <p className={styles.candidateEmpty}>No hay movimientos elegibles cercanos con el mismo signo.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.sideColumn}>
              <section className={styles.panel}>
                <div className={styles.sectionHeaderCompact}>
                  <div>
                    <p className={styles.eyebrow}>NUEVO</p>
                    <h2>Añadir previsión</h2>
                  </div>
                </div>
                <form className={styles.manualForm} onSubmit={(event) => void createManual(event)}>
                  <label>Fecha<input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} required /></label>
                  <label>Concepto<input value={manualConcept} maxLength={240} onChange={(event) => setManualConcept(event.target.value)} placeholder="Ej. Seguro anual" required /></label>
                  <div className={styles.formSplit}>
                    <label>Tipo<select value={manualKind} onChange={(event) => setManualKind(event.target.value as "expense" | "income")}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
                    <label>Importe<input inputMode="decimal" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} placeholder="0,00" required /></label>
                  </div>
                  <label>Confianza<select value={manualConfidence} onChange={(event) => setManualConfidence(event.target.value as "high" | "medium" | "low")}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
                  <button className={styles.primaryButton} type="submit" disabled={busy !== null}>{busy === "manual" ? "Guardando…" : "Añadir al calendario"}</button>
                </form>
              </section>

              <section className={styles.panel}>
                <p className={styles.eyebrow}>PRESUPUESTO · CONTEXTO</p>
                <h2>Meses del periodo</h2>
                <div className={styles.budgetList}>
                  {snapshot.budgetContext.map((month) => (
                    <div key={month.month} className={styles.budgetRow}>
                      <div><strong>{formatMonth(month.month)}</strong><small>{month.status === "over" ? "Superado" : "En seguimiento"}</small></div>
                      <div><span>{money.format(month.budgetCents / 100)}</span><small>restan {money.format(month.remainingCents / 100)}</small></div>
                    </div>
                  ))}
                </div>
                <p className={styles.contextNote}>El presupuesto no genera cargos fechados: solo aporta contexto al calendario.</p>
              </section>

              <section className={styles.panel}>
                <p className={styles.eyebrow}>FUENTES Y CALIDAD</p>
                <h2>Cómo se calcula</h2>
                <ul className={styles.principles}>
                  <li>Fuente bancaria oficial: <strong>solo lectura</strong>.</li>
                  <li>Saldo inicial: motor central de saldos financieros.</li>
                  <li>Recurrencias: solo las confirmadas como activas.</li>
                  <li>Excluidos y confirmados no vuelven a impactar el cash flow futuro.</li>
                  <li>Consultar la previsión no modifica datos.</li>
                </ul>
                {snapshot.balanceContext.quality.integrityDeltaAccounts > 0 ? (
                  <div className={styles.qualityWarning}>
                    Hay {snapshot.balanceContext.quality.integrityDeltaAccounts} cuenta con diferencia de reconstrucción conocida. La previsión mantiene el saldo bancario explícito como referencia.
                  </div>
                ) : null}
              </section>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
