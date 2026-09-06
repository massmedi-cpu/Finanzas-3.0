"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./budgets.module.css";

type BudgetStatus = "empty" | "unfunded" | "on_track" | "over";

type HistoryMonth = {
  month: string;
  expenseCents: number;
};

type BudgetItem = {
  id: string | null;
  persisted: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryLifecycle: "active" | "archived" | null;
  automaticAmountCents: number;
  manualAmountCents: number | null;
  effectiveAmountCents: number;
  actualExpenseCents: number;
  remainingCents: number;
  progressBps: number | null;
  status: BudgetStatus;
  automaticExplanation: string;
  historyMonths: HistoryMonth[];
};

type BudgetSnapshot = {
  contractVersion: number;
  month: string;
  monthStart: string;
  monthEnd: string;
  total: BudgetItem;
  categories: BudgetItem[];
  principles: {
    bankSource: "read_only";
    actualSource: string;
    recommendation: string;
    transfersConsumeBudget: boolean;
    confirmedDuplicatesConsumeBudget: boolean;
    manualAnalyticsExclusionsRespected: boolean;
    refundsNetAgainstExpense: boolean;
    manualOverrideWins: boolean;
    parentCategoryIncludesDescendants: boolean;
  };
};

type IconName = "wallet" | "spent" | "remaining" | "progress" | "spark" | "category" | "refresh" | "warning";

const moneyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function currentMonthMadrid() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const formatted = monthFormatter.format(new Date(Date.UTC(year, month - 1, 15, 12)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatProgress(bps: number | null) {
  if (bps === null) return "Sin referencia";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bps / 100)} %`;
}

function progressWidth(item: BudgetItem) {
  if (item.progressBps === null || item.progressBps <= 0) return 0;
  return Math.min(100, item.progressBps / 100);
}

function readableError(payload: any) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (code.includes("budget_month")) return "El mes seleccionado no es válido.";
  if (code.includes("budget_manual_amount")) return "El presupuesto manual debe ser un importe positivo o cero.";
  if (code.includes("budget_category_not_found")) return "La categoría ya no está disponible. Actualiza los presupuestos.";
  if (code.includes("budget_category_must_be_expense")) return "Solo las categorías de gasto pueden tener presupuesto.";
  if (payload?.error === "authentication_required") return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  return "No se pudo completar la operación de presupuestos.";
}

function euroInputFromCents(cents: number | null) {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseEuroInput(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return undefined;
  const euros = Number(normalized);
  const cents = Math.round(euros * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : undefined;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    wallet: <><path d="M4 7.5h15.5v11H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h13v4"/><path d="M15 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></>,
    spent: <><path d="M4 4v16h16"/><path d="m7 15 4-4 3 3 5-6"/><path d="M16 8h3v3"/></>,
    remaining: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    progress: <><path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18H2"/></>,
    spark: <><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></>,
    category: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.4 6.4L4 9"/><path d="M5.5 15A7 7 0 0 0 17.6 17.6L20 15"/></>,
    warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
  };

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function statusLabel(status: BudgetStatus) {
  if (status === "over") return "Superado";
  if (status === "unfunded") return "Sin límite";
  if (status === "empty") return "Sin actividad";
  return "En objetivo";
}

function BudgetCard({
  item,
  total = false,
  busy,
  editing,
  editValue,
  onStartEdit,
  onChangeEdit,
  onCancelEdit,
  onSave,
  onClearManual,
}: {
  item: BudgetItem;
  total?: boolean;
  busy: boolean;
  editing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onChangeEdit: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onClearManual: () => void;
}) {
  const maxHistory = Math.max(1, ...item.historyMonths.map((row) => row.expenseCents));
  const remainingLabel = item.remainingCents >= 0 ? "Disponible" : "Exceso";

  return (
    <article className={`${styles.budgetCard} ${total ? styles.budgetCardPrimary : ""}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardTitle}>
          <span className={styles.cardIcon}><Icon name={total ? "wallet" : "category"} /></span>
          <div>
            <h3>{total ? "Presupuesto mensual total" : item.categoryName ?? "Categoría"}</h3>
            <p>
              {item.manualAmountCents !== null
                ? "Límite manual activo"
                : "Límite automático · media de 3 meses"}
              {!total && item.categoryLifecycle === "archived" ? " · categoría archivada" : ""}
            </p>
          </div>
        </div>
        <span className={`${styles.status} ${styles[item.status]}`}>{statusLabel(item.status)}</span>
      </div>

      <div className={styles.amounts}>
        <div>
          <span>Presupuesto</span>
          <strong>{formatMoney(item.effectiveAmountCents)}</strong>
        </div>
        <div>
          <span>Gastado</span>
          <strong>{formatMoney(item.actualExpenseCents)}</strong>
        </div>
        <div>
          <span>{remainingLabel}</span>
          <strong>{formatMoney(Math.abs(item.remainingCents))}</strong>
        </div>
      </div>

      <div className={styles.progressMeta}>
        <span>Consumo</span>
        <strong>{formatProgress(item.progressBps)}</strong>
      </div>
      <div className={styles.progressTrack} aria-label={`Consumo ${formatProgress(item.progressBps)}`}>
        <div
          className={`${styles.progressFill} ${item.status === "over" ? styles.progressOver : ""}`}
          style={{ width: `${progressWidth(item)}%` }}
        />
      </div>

      <div className={styles.cardActions}>
        <button className={styles.textButton} type="button" onClick={onStartEdit} disabled={busy || editing}>
          {item.manualAmountCents === null ? "Fijar límite manual" : "Editar límite manual"}
        </button>
        {item.manualAmountCents !== null ? (
          <>
            <span className={styles.manualBadge}>Manual · automático {formatMoney(item.automaticAmountCents)}</span>
            <button className={styles.textButton} type="button" onClick={onClearManual} disabled={busy}>
              Volver a automático
            </button>
          </>
        ) : null}
      </div>

      {editing ? (
        <div className={styles.editor}>
          <label>
            Importe mensual (€)
            <input
              autoFocus
              inputMode="decimal"
              value={editValue}
              onChange={(event) => onChangeEdit(event.target.value)}
              placeholder={euroInputFromCents(item.effectiveAmountCents)}
              aria-label={`Presupuesto manual de ${total ? "total mensual" : item.categoryName ?? "categoría"}`}
            />
          </label>
          <div className={styles.editorButtons}>
            <button className={styles.secondaryButton} type="button" onClick={onCancelEdit} disabled={busy}>Cancelar</button>
            <button className={styles.actionButton} type="button" onClick={onSave} disabled={busy}>Guardar</button>
          </div>
        </div>
      ) : null}

      <p className={styles.helper}>
        El gasto real procede del motor financiero central. El presupuesto no altera ningún movimiento bancario.
      </p>

      {total ? (
        <>
          <div className={styles.history} style={{ marginTop: "1rem" }} aria-label="Histórico usado para el cálculo automático">
            {item.historyMonths.map((row) => (
              <div className={styles.historyRow} key={row.month}>
                <span>{formatMonth(row.month).replace(/ de /g, " ").split(" ").slice(0, 1).join(" ")}</span>
                <div className={styles.historyBar}><i style={{ width: `${Math.max(3, (row.expenseCents / maxHistory) * 100)}%` }} /></div>
                <strong>{formatMoney(row.expenseCents)}</strong>
              </div>
            ))}
          </div>
          <p className={styles.explanation}>{item.automaticExplanation}</p>
        </>
      ) : null}
    </article>
  );
}

export default function BudgetsClient() {
  const [month, setMonth] = useState(currentMonthMadrid);
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchSnapshot = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/budgets?month=${encodeURIComponent(selectedMonth)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(readableError(payload));
      setSnapshot(payload as BudgetSnapshot);
      setEditingKey(null);
    } catch (caught) {
      setSnapshot(null);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los presupuestos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(month);
  }, [fetchSnapshot, month]);

  const mutate = useCallback(async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/budgets", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(readableError(payload));
      setSnapshot(payload as BudgetSnapshot);
      setEditingKey(null);
      setEditValue("");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el presupuesto.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    void mutate("POST", { month });
  }, [month, mutate]);

  const startEdit = useCallback((item: BudgetItem) => {
    const key = item.categoryId ?? "__total__";
    setEditingKey(key);
    setEditValue(euroInputFromCents(item.manualAmountCents ?? item.effectiveAmountCents));
  }, []);

  const saveManual = useCallback((item: BudgetItem) => {
    const cents = parseEuroInput(editValue);
    if (cents === undefined || cents === null) {
      setError("Introduce un importe válido con un máximo de dos decimales.");
      return;
    }
    void mutate("PATCH", {
      month,
      categoryId: item.categoryId,
      manualAmountCents: cents,
    });
  }, [editValue, month, mutate]);

  const clearManual = useCallback((item: BudgetItem) => {
    void mutate("PATCH", {
      month,
      categoryId: item.categoryId,
      manualAmountCents: null,
    });
  }, [month, mutate]);

  const categorySummary = useMemo(() => {
    if (!snapshot) return { over: 0, onTrack: 0, total: 0 };
    return {
      over: snapshot.categories.filter((item) => item.status === "over").length,
      onTrack: snapshot.categories.filter((item) => item.status === "on_track").length,
      total: snapshot.categories.length,
    };
  }, [snapshot]);

  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="budget-title">
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/">← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · FASE 6</p>
          <h1 id="budget-title">Presupuestos</h1>
          <p className={styles.heroText}>
            Control mensual con un único motor central: recomendación automática basada en tus gastos reales,
            límites manuales auditables y consumo calculado sin modificar nunca la fuente bancaria.
          </p>
        </div>

        <div className={styles.heroControls} aria-label="Controles de presupuesto">
          <label className={styles.monthField}>
            Mes
            <input
              type="month"
              min="0001-01"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={busy}
            />
          </label>
          <button className={styles.actionButton} type="button" onClick={handleRefresh} disabled={busy || loading}>
            <Icon name="refresh" />
            {busy ? "Actualizando…" : "Recalcular y guardar"}
          </button>
        </div>
      </section>

      <div className={styles.content}>
        {error ? (
          <div className={styles.alert} role="alert">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <section className={styles.panel}>
            <div className={styles.loading} aria-live="polite">
              <div>
                <div className={styles.spinner} />
                Cargando presupuesto de {formatMonth(month)}…
              </div>
            </div>
          </section>
        ) : snapshot ? (
          <>
            <section className={styles.summaryGrid} aria-label="Resumen del presupuesto mensual">
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="wallet" /> Presupuesto</span>
                <strong>{formatMoney(snapshot.total.effectiveAmountCents)}</strong>
                <small>{snapshot.total.manualAmountCents === null ? "Calculado automáticamente" : "Límite manual activo"}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="spent" /> Gastado</span>
                <strong>{formatMoney(snapshot.total.actualExpenseCents)}</strong>
                <small>Gasto elegible de {formatMonth(snapshot.month)}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="remaining" /> {snapshot.total.remainingCents >= 0 ? "Disponible" : "Exceso"}</span>
                <strong>{formatMoney(Math.abs(snapshot.total.remainingCents))}</strong>
                <small>{snapshot.total.status === "over" ? "El límite mensual está superado" : "Margen restante del mes"}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="progress" /> Consumo</span>
                <strong>{formatProgress(snapshot.total.progressBps)}</strong>
                <small>{categorySummary.total ? `${categorySummary.onTrack} categorías en objetivo · ${categorySummary.over} superadas` : "Sin categorías de gasto activas"}</small>
              </article>
            </section>

            <section className={styles.mainGrid}>
              <div className={styles.panel}>
                <div className={styles.panelInner}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Límites del mes</h2>
                      <p>Total mensual y detalle por categorías de gasto.</p>
                    </div>
                    <span className={`${styles.status} ${styles[snapshot.total.status]}`}>{formatMonth(snapshot.month)}</span>
                  </div>

                  <div className={styles.budgetList}>
                    <BudgetCard
                      item={snapshot.total}
                      total
                      busy={busy}
                      editing={editingKey === "__total__"}
                      editValue={editValue}
                      onStartEdit={() => startEdit(snapshot.total)}
                      onChangeEdit={setEditValue}
                      onCancelEdit={() => setEditingKey(null)}
                      onSave={() => saveManual(snapshot.total)}
                      onClearManual={() => clearManual(snapshot.total)}
                    />

                    {snapshot.categories.map((item) => (
                      <BudgetCard
                        key={item.categoryId ?? item.id ?? item.categoryName ?? "category"}
                        item={item}
                        busy={busy}
                        editing={editingKey === item.categoryId}
                        editValue={editValue}
                        onStartEdit={() => startEdit(item)}
                        onChangeEdit={setEditValue}
                        onCancelEdit={() => setEditingKey(null)}
                        onSave={() => saveManual(item)}
                        onClearManual={() => clearManual(item)}
                      />
                    ))}

                    {snapshot.categories.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span className={styles.cardIcon} style={{ margin: "0 auto" }}><Icon name="category" /></span>
                        <strong>No hay categorías de gasto activas</strong>
                        <p>
                          El presupuesto total ya funciona. Cuando existan categorías de gasto activas, aparecerán aquí
                          automáticamente con su recomendación y consumo real, sin duplicar cálculos en el cliente.
                        </p>
                        <Link href="/configuration">Abrir Configuración</Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <aside className={styles.panel}>
                <div className={styles.panelInner}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Cómo se calcula</h2>
                      <p>Reglas visibles y auditables del motor.</p>
                    </div>
                    <span className={styles.cardIcon}><Icon name="spark" /></span>
                  </div>

                  <div className={styles.history} aria-label="Histórico de gasto usado para recomendar presupuesto">
                    {snapshot.total.historyMonths.map((row) => {
                      const maximum = Math.max(1, ...snapshot.total.historyMonths.map((entry) => entry.expenseCents));
                      return (
                        <div className={styles.historyRow} key={row.month}>
                          <span>{formatMonth(row.month).replace(/ de /g, " ").split(" ")[0]}</span>
                          <div className={styles.historyBar}><i style={{ width: `${Math.max(3, (row.expenseCents / maximum) * 100)}%` }} /></div>
                          <strong>{formatMoney(row.expenseCents)}</strong>
                        </div>
                      );
                    })}
                  </div>

                  <p className={styles.explanation}>{snapshot.total.automaticExplanation}</p>

                  <div className={styles.principles}>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Fuente bancaria estrictamente de solo lectura.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>El gasto real sale de <code>financial_transaction_facts()</code>, la misma fuente de verdad de F5.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las transferencias no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Los duplicados confirmados y las exclusiones manuales no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Un límite manual tiene prioridad sin destruir la recomendación automática.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las categorías padre agregan sus subcategorías para evitar dobles cálculos.</span></div>
                  </div>
                </div>
              </aside>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
