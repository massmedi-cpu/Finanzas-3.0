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

type ManualErrors = {
  concept?: string;
  amount?: string;
};

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
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

function ForecastBalanceCurve({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const points = [
    {
      id: "opening",
      label: "Saldo inicial",
      date: snapshot.period.dateFrom,
      balanceCents: snapshot.summary.openingBalanceCents,
    },
    ...snapshot.items.map((item) => ({
      id: item.id,
      label: item.concept,
      date: item.date,
      balanceCents: item.projectedBalanceAfterCents,
    })),
  ];
  const balances = points.map((point) => point.balanceCents);
  const minimum = Math.min(...balances);
  const maximum = Math.max(...balances);
  const range = Math.max(1, maximum - minimum);
  const coordinateFor = (balanceCents: number) => 15 + ((maximum - balanceCents) / range) * 70;
  const xFor = (index: number) => points.length <= 1 ? 50 : 5 + (index / (points.length - 1)) * 90;
  const polyline = points.map((point, index) => `${xFor(index) * 10},${coordinateFor(point.balanceCents) * 2.4}`).join(" ");

  return (
    <section
      aria-label="Curva de saldo prevista"
      style={{
        marginTop: "1.25rem",
        padding: "clamp(1rem, 2.2vw, 1.5rem)",
        borderRadius: "24px",
        border: "1px solid var(--border-subtle, rgba(255,255,255,.12))",
        background: "linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018))",
        display: "grid",
        gap: "1rem",
      }}
    >
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>SALDO PROYECTADO</p>
          <h2>Curva de saldo prevista</h2>
        </div>
        <span style={{ fontSize: ".82rem", opacity: .75 }}>Valores del motor de previsión · sin recálculo visual</span>
      </div>

      <div style={{ position: "relative", height: "15rem", borderRadius: "1rem", overflow: "visible", background: "rgba(255,255,255,.018)" }}>
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="forecast-curve-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".45" />
              <stop offset="100%" stopColor="currentColor" stopOpacity=".95" />
            </linearGradient>
          </defs>
          <line x1="0" x2="1000" y1="120" y2="120" stroke="currentColor" strokeOpacity=".08" strokeDasharray="8 12" />
          <polyline points={polyline} fill="none" stroke="url(#forecast-curve-gradient)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>

        {points.map((point, index) => {
          const id = `forecast-balance-${point.id}`;
          const label = `${point.label} · ${formatDate(point.date)} · ${money.format(point.balanceCents / 100)}`;
          return (
            <div
              key={point.id}
              style={{
                position: "absolute",
                left: `${xFor(index)}%`,
                top: `${coordinateFor(point.balanceCents)}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <button
                type="button"
                aria-label={label}
                onFocus={() => setActivePoint(id)}
                onBlur={() => setActivePoint((current) => current === id ? null : current)}
                onMouseEnter={() => setActivePoint(id)}
                onMouseLeave={() => setActivePoint((current) => current === id ? null : current)}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  border: 0,
                  padding: 0,
                  background: "radial-gradient(circle, currentColor 0 7px, transparent 8px)",
                  boxShadow: "none",
                  cursor: "default",
                }}
              />
              {activePoint === id ? (
                <div
                  role="tooltip"
                  style={{
                    position: "absolute",
                    zIndex: 6,
                    left: "50%",
                    bottom: "calc(100% + .7rem)",
                    transform: "translateX(-50%)",
                    padding: ".5rem .65rem",
                    borderRadius: ".65rem",
                    background: "var(--surface-elevated, #151922)",
                    border: "1px solid var(--border-subtle, rgba(255,255,255,.15))",
                    boxShadow: "0 10px 30px rgba(0,0,0,.28)",
                    whiteSpace: "nowrap",
                    fontSize: ".78rem",
                  }}
                >
                  {point.label} · {money.format(point.balanceCents / 100)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table aria-label="Datos de la curva de saldo" style={{ width: "100%", borderCollapse: "collapse", minWidth: "34rem" }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left", padding: ".65rem" }}>Hito</th>
              <th scope="col" style={{ textAlign: "left", padding: ".65rem" }}>Fecha</th>
              <th scope="col" style={{ textAlign: "right", padding: ".65rem" }}>Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id}>
                <th scope="row" style={{ textAlign: "left", padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)" }}>{point.label}</th>
                <td style={{ padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)" }}>{formatDate(point.date)}</td>
                <td style={{ textAlign: "right", padding: ".65rem", borderTop: "1px solid rgba(255,255,255,.08)", fontVariantNumeric: "tabular-nums" }}>{money.format(point.balanceCents / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  const [manualErrors, setManualErrors] = useState<ManualErrors>({});
  const [excludeReasons, setExcludeReasons] = useState<Record<string, string>>({});
  const [excludeErrorFor, setExcludeErrorFor] = useState<string | null>(null);
  const [candidateFor, setCandidateFor] = useState<string | null>(null);
  const [candidateData, setCandidateData] = useState<CandidateSnapshot | null>(null);
  const manualConceptRef = useRef<HTMLInputElement | null>(null);
  const manualAmountRef = useRef<HTMLInputElement | null>(null);
  const candidateCloseRef = useRef<HTMLButtonElement | null>(null);
  const candidateTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
    const amountError = absoluteCents === null || absoluteCents <= 0
      ? "Introduce un importe válido con hasta dos decimales."
      : undefined;
    const conceptError = !manualConcept.trim()
      ? "Escribe un concepto para la previsión manual."
      : undefined;

    setManualErrors({ concept: conceptError, amount: amountError });
    if (amountError || conceptError) {
      setError(null);
      setNotice(null);
      window.requestAnimationFrame(() => {
        if (conceptError) manualConceptRef.current?.focus();
        else manualAmountRef.current?.focus();
      });
      return;
    }
    if (absoluteCents === null || absoluteCents <= 0) return;

    setManualErrors({});
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
      setError(null);
      setNotice(null);
      setExcludeErrorFor(item.id);
      window.requestAnimationFrame(() => document.getElementById(`exclude-reason-${item.id}`)?.focus());
      return;
    }

    setExcludeErrorFor((current) => current === item.id ? null : current);
    await runMutation(`exclude:${item.id}`, async () => {
      await readJson(await fetch("/api/forecast", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exclude", id: item.id, excluded: nextExcluded, reason }),
      }));
      setNotice(nextExcluded ? "Elemento excluido del saldo previsto." : "Elemento restaurado en la previsión.");
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
      window.requestAnimationFrame(() => candidateCloseRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron buscar movimientos reales");
      setCandidateFor(null);
      window.requestAnimationFrame(() => candidateTriggerRefs.current[item.id]?.focus());
    } finally {
      setBusy(null);
    }
  }

  function closeCandidates(itemId: string) {
    setCandidateFor(null);
    setCandidateData(null);
    window.requestAnimationFrame(() => candidateTriggerRefs.current[itemId]?.focus());
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
          <p className={styles.eyebrow}>FINANCIAL APP · PREVISIÓN</p>
          <h1>Previsión</h1>
          <p className={styles.lead}>
            Anticipa ingresos y gastos, revisa recurrencias y comprueba cómo pueden cambiar tus saldos en las próximas semanas.
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

          <ForecastBalanceCurve snapshot={snapshot} />

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
                  {items.map((item) => {
                    const excludeErrorId = `exclude-reason-error-${item.id}`;
                    const candidatesId = `forecast-candidates-${item.id}`;
                    return (
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
                                <>
                                  <input
                                    id={`exclude-reason-${item.id}`}
                                    className={styles.reasonInput}
                                    placeholder="Motivo para excluir"
                                    value={excludeReasons[item.id] ?? ""}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setExcludeReasons((current) => ({ ...current, [item.id]: value }));
                                      if (excludeErrorFor === item.id && value.trim()) setExcludeErrorFor(null);
                                    }}
                                    aria-label={`Motivo para excluir ${item.concept}`}
                                    aria-invalid={excludeErrorFor === item.id || undefined}
                                    aria-describedby={excludeErrorFor === item.id ? excludeErrorId : undefined}
                                  />
                                  {excludeErrorFor === item.id ? (
                                    <span id={excludeErrorId} className={styles.fieldError} role="alert">
                                      Indica el motivo antes de excluir un elemento previsto.
                                    </span>
                                  ) : null}
                                </>
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
                              ref={(node) => { candidateTriggerRefs.current[item.id] = node; }}
                              className={styles.ghostButton}
                              onClick={() => void loadCandidates(item)}
                              disabled={busy !== null}
                              aria-expanded={candidateFor === item.id}
                              aria-controls={candidatesId}
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
                          <div id={candidatesId} className={styles.candidates} aria-label={`Movimientos reales candidatos para ${item.concept}`}>
                            <div className={styles.candidateHeader}>
                              <strong>Candidatos reales ±7 días</strong>
                              <button ref={candidateCloseRef} className={styles.textButton} onClick={() => closeCandidates(item.id)}>Cerrar</button>
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
                  );})}
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
                <form className={styles.manualForm} onSubmit={(event) => void createManual(event)} noValidate>
                  <label>Fecha<input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} required /></label>
                  <label>
                    Concepto
                    <input
                      id="forecast-manual-concept"
                      ref={manualConceptRef}
                      value={manualConcept}
                      maxLength={240}
                      onChange={(event) => {
                        setManualConcept(event.target.value);
                        if (manualErrors.concept) setManualErrors((current) => ({ ...current, concept: undefined }));
                      }}
                      placeholder="Ej. Seguro anual"
                      aria-invalid={Boolean(manualErrors.concept) || undefined}
                      aria-describedby={manualErrors.concept ? "forecast-manual-concept-error" : undefined}
                    />
                    {manualErrors.concept ? <span id="forecast-manual-concept-error" className={styles.fieldError} role="alert">{manualErrors.concept}</span> : null}
                  </label>
                  <div className={styles.formSplit}>
                    <label>Tipo<select value={manualKind} onChange={(event) => setManualKind(event.target.value as "expense" | "income")}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
                    <label>
                      Importe
                      <input
                        id="forecast-manual-amount"
                        ref={manualAmountRef}
                        inputMode="decimal"
                        value={manualAmount}
                        onChange={(event) => {
                          setManualAmount(event.target.value);
                          if (manualErrors.amount) setManualErrors((current) => ({ ...current, amount: undefined }));
                        }}
                        placeholder="0,00"
                        aria-invalid={Boolean(manualErrors.amount) || undefined}
                        aria-describedby={manualErrors.amount ? "forecast-manual-amount-error" : undefined}
                      />
                      {manualErrors.amount ? <span id="forecast-manual-amount-error" className={styles.fieldError} role="alert">{manualErrors.amount}</span> : null}
                    </label>
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
                  <li>Saldo inicial: saldos actuales de tus cuentas.</li>
                  <li>Recurrencias: solo las confirmadas como activas.</li>
                  <li>Los elementos excluidos o ya confirmados no vuelven a afectar al saldo previsto.</li>
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
