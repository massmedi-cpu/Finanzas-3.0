"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isBudgetSnapshot,
  type BudgetItem,
  type BudgetSnapshot,
  type BudgetStatus,
} from "../../src/application/budgets/budget-contract";
import { ProductIcon } from "../../src/design/product-icons";
import styles from "./budgets-premium.module.css";

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat("es-ES", {
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
  return money.format(cents / 100);
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const text = monthLabel.format(new Date(Date.UTC(year, month - 1, 15, 12)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatProgress(bps: number | null) {
  return bps === null ? "Sin referencia" : `${percent.format(bps / 100)} %`;
}

function progressWidth(bps: number | null) {
  if (bps === null || bps <= 0) return 0;
  return Math.min(100, bps / 100);
}

function statusLabel(status: BudgetStatus) {
  if (status === "over") return "Superado";
  if (status === "unfunded") return "Sin límite";
  if (status === "empty") return "Sin actividad";
  return "En objetivo";
}

function statusPriority(item: BudgetItem) {
  if (item.status === "over") return 4;
  if (item.status === "unfunded" && item.actualExpenseCents > 0) return 3;
  if ((item.progressBps ?? 0) >= 8000) return 2;
  if (item.status === "on_track") return 1;
  return 0;
}

function readableError(payload: unknown) {
  const row = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const code = typeof row.code === "string" ? row.code : "";
  if (code.includes("budget_month")) return "El mes seleccionado no es válido.";
  if (code.includes("budget_manual_amount")) return "El presupuesto manual debe ser un importe positivo o cero.";
  if (code.includes("budget_category_not_found")) return "La categoría ya no está disponible. Actualiza los presupuestos.";
  if (code.includes("budget_category_must_be_expense")) return "Solo las categorías de gasto pueden tener presupuesto.";
  if (row.error === "authentication_required") return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  if (code === "workspace_context_required") return "No se ha podido resolver tu espacio financiero.";
  return "No se pudo completar la operación de presupuestos.";
}

function euroInputFromCents(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

function normalizeSpanishInteger(value: string) {
  if (/^\d+$/.test(value)) return value;
  const groups = value.split(".");
  if (
    groups.length < 2 ||
    !/^\d{1,3}$/.test(groups[0] ?? "") ||
    groups.slice(1).some((group) => !/^\d{3}$/.test(group))
  ) return null;
  return groups.join("");
}

function parseEuroInput(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;
  if (!/^\d[\d.,]*$/.test(compact)) return undefined;

  let integerPart = "";
  let decimalPart = "";
  if (compact.includes(",")) {
    if ((compact.match(/,/g) ?? []).length !== 1) return undefined;
    const [integerRaw, decimalRaw] = compact.split(",");
    if (!integerRaw || !/^\d{1,2}$/.test(decimalRaw ?? "")) return undefined;
    const normalized = normalizeSpanishInteger(integerRaw);
    if (normalized === null) return undefined;
    integerPart = normalized;
    decimalPart = decimalRaw;
  } else if (compact.includes(".")) {
    const pieces = compact.split(".");
    if (pieces.length === 2 && /^\d+$/.test(pieces[0] ?? "") && /^\d{1,2}$/.test(pieces[1] ?? "")) {
      integerPart = pieces[0];
      decimalPart = pieces[1];
    } else {
      const normalized = normalizeSpanishInteger(compact);
      if (normalized === null) return undefined;
      integerPart = normalized;
    }
  } else {
    integerPart = compact;
  }

  if (!/^\d+$/.test(integerPart)) return undefined;
  const cents = Math.round(Number(`${integerPart}.${decimalPart.padEnd(2, "0") || "00"}`) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : undefined;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Progress({ item, label = "Consumo" }: { item: BudgetItem; label?: string }) {
  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressMeta}>
        <span>{label}</span>
        <strong>{formatProgress(item.progressBps)}</strong>
      </div>
      <div className={styles.progressTrack} aria-label={`${label} ${formatProgress(item.progressBps)}`}>
        <i className={item.status === "over" ? styles.progressDanger : styles.progressFill} style={{ width: `${progressWidth(item.progressBps)}%` }} />
      </div>
    </div>
  );
}

type EditorState = { key: string; value: string; error: string } | null;

function BudgetRow({
  item,
  monthStart,
  monthEnd,
  busy,
  editor,
  onEdit,
  onEditValue,
  onCancel,
  onSave,
  onClear,
}: {
  item: BudgetItem;
  monthStart: string;
  monthEnd: string;
  busy: boolean;
  editor: EditorState;
  onEdit: (item: BudgetItem) => void;
  onEditValue: (value: string) => void;
  onCancel: () => void;
  onSave: (item: BudgetItem) => void;
  onClear: (item: BudgetItem) => void;
}) {
  const key = item.categoryId ?? "__total__";
  const editing = editor?.key === key;
  const causalHref = item.categoryId
    ? `/transactions?dateFrom=${monthStart}&dateTo=${monthEnd}&kind=expense&categoryId=${encodeURIComponent(item.categoryId)}`
    : `/transactions?dateFrom=${monthStart}&dateTo=${monthEnd}&kind=expense`;
  const remainingLabel = item.remainingCents >= 0 ? "Disponible" : "Exceso";
  const errorId = `budget-error-${key}`;

  return (
    <article className={`${styles.budgetRow} ${item.categoryId === null ? styles.totalRow : ""}`} data-budget-state={item.status}>
      <div className={styles.rowHeading}>
        <div className={styles.rowIdentity}>
          <span className={styles.rowIcon}><ProductIcon name={item.categoryId === null ? "wallet" : "category"} size={18} /></span>
          <div>
            <h3>{item.categoryId === null ? "Presupuesto mensual total" : item.categoryName ?? "Categoría"}</h3>
            <p>{item.manualAmountCents === null ? "Automático · media de 3 meses" : `Manual · automático ${formatMoney(item.automaticAmountCents)}`}</p>
          </div>
        </div>
        <span className={`${styles.status} ${styles[item.status]}`}>{statusLabel(item.status)}</span>
      </div>

      <div className={styles.rowNumbers}>
        <div><span>Presupuesto</span><strong>{formatMoney(item.effectiveAmountCents)}</strong></div>
        <div><span>Gastado</span><strong>{formatMoney(item.actualExpenseCents)}</strong></div>
        <div><span>{remainingLabel}</span><strong>{formatMoney(Math.abs(item.remainingCents))}</strong></div>
      </div>

      <Progress item={item} />

      <div className={styles.rowActions}>
        <Link href={causalHref}>{item.categoryId === null ? "Ver gastos del mes" : "Ver movimientos"}</Link>
        <button type="button" onClick={() => onEdit(item)} disabled={busy || editing}>
          {item.manualAmountCents === null ? "Fijar límite manual" : "Editar límite manual"}
        </button>
        {item.manualAmountCents !== null ? (
          <button type="button" onClick={() => onClear(item)} disabled={busy}>Volver a automático</button>
        ) : null}
      </div>

      {editing ? (
        <div className={styles.editor}>
          <label>
            Importe mensual (€)
            <input
              autoFocus
              inputMode="decimal"
              value={editor.value}
              onChange={(event) => onEditValue(event.target.value)}
              aria-label={`Presupuesto manual de ${item.categoryId === null ? "total mensual" : item.categoryName ?? "categoría"}`}
              aria-invalid={editor.error ? "true" : "false"}
              aria-describedby={editor.error ? errorId : undefined}
            />
            {editor.error ? <span id={errorId} role="alert" className={styles.fieldError}>{editor.error}</span> : null}
          </label>
          <div className={styles.editorActions}>
            <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button type="button" className={styles.primaryButton} onClick={() => onSave(item)} disabled={busy}>Guardar</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function BudgetsPremiumClient({ initialSnapshot }: { initialSnapshot: BudgetSnapshot | null }) {
  const [month, setMonth] = useState(initialSnapshot?.month ?? currentMonthMadrid());
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const initialHydrationMonth = useRef(initialSnapshot?.month ?? null);
  const activeFetch = useRef<AbortController | null>(null);
  const fetchGeneration = useRef(0);

  const fetchSnapshot = useCallback(async (selectedMonth: string) => {
    activeFetch.current?.abort();
    const controller = new AbortController();
    activeFetch.current = controller;
    const generation = ++fetchGeneration.current;
    setLoading(true);
    setError("");
    setNotice("");
    setEditor(null);

    try {
      const response = await fetch(`/api/budgets?month=${encodeURIComponent(selectedMonth)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (generation !== fetchGeneration.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(readableError(payload));
      if (!isBudgetSnapshot(payload) || payload.month !== selectedMonth) {
        throw new Error("El servidor devolvió un presupuesto incompatible con el mes seleccionado.");
      }
      setSnapshot(payload);
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      if (generation !== fetchGeneration.current) return;
      setSnapshot(null);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los presupuestos.");
    } finally {
      if (activeFetch.current === controller) activeFetch.current = null;
      if (generation === fetchGeneration.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialHydrationMonth.current === month) {
      initialHydrationMonth.current = null;
      return;
    }
    void fetchSnapshot(month);
    return () => activeFetch.current?.abort();
  }, [fetchSnapshot, month]);

  useEffect(() => () => activeFetch.current?.abort(), []);

  const mutate = useCallback(async (
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    activeFetch.current?.abort();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/budgets", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readableError(payload));
      if (!isBudgetSnapshot(payload) || payload.month !== month) {
        throw new Error("El servidor devolvió un presupuesto incompatible tras guardar.");
      }
      setSnapshot(payload);
      setEditor(null);
      setNotice(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el presupuesto.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [month]);

  const orderedCategories = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.categories].sort((a, b) => {
      const priority = statusPriority(b) - statusPriority(a);
      if (priority !== 0) return priority;
      const progress = (b.progressBps ?? -1) - (a.progressBps ?? -1);
      if (progress !== 0) return progress;
      return (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "es");
    });
  }, [snapshot]);

  const attention = useMemo(() => orderedCategories.filter((item) => statusPriority(item) >= 2).slice(0, 4), [orderedCategories]);
  const summary = useMemo(() => ({
    over: snapshot?.categories.filter((item) => item.status === "over").length ?? 0,
    near: snapshot?.categories.filter((item) => item.status !== "over" && (item.progressBps ?? 0) >= 8000).length ?? 0,
  }), [snapshot]);

  const startEdit = useCallback((item: BudgetItem) => {
    setError("");
    setNotice("");
    setEditor({
      key: item.categoryId ?? "__total__",
      value: euroInputFromCents(item.manualAmountCents ?? item.effectiveAmountCents),
      error: "",
    });
  }, []);

  const saveManual = useCallback((item: BudgetItem) => {
    if (!editor) return;
    const cents = parseEuroInput(editor.value);
    if (cents === undefined || cents === null) {
      setEditor({ ...editor, error: "Introduce un importe válido con un máximo de dos decimales." });
      return;
    }
    void mutate("PATCH", { month, categoryId: item.categoryId, manualAmountCents: cents }, "Límite manual guardado.");
  }, [editor, month, mutate]);

  const clearManual = useCallback((item: BudgetItem) => {
    void mutate("PATCH", { month, categoryId: item.categoryId, manualAmountCents: null }, "Se ha restaurado el cálculo automático.");
  }, [month, mutate]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backLink} href="/">← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · PRESUPUESTOS</p>
          <h1>Presupuestos</h1>
        </div>
        <div className={styles.controls} aria-label="Controles de presupuesto">
          <label>
            Mes
            <input type="month" value={month} min="0001-01" disabled={busy} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          </label>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={busy || loading}
            onClick={() => void mutate("POST", { month }, `Presupuesto de ${formatMonth(month)} recalculado y guardado.`)}
          >
            <ProductIcon name="refresh" size={17} />
            {busy ? "Actualizando…" : "Recalcular y guardar"}
          </button>
        </div>
      </header>

      {error ? <div className={styles.alert} role="alert"><ProductIcon name="warning" size={18} />{error}</div> : null}
      {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

      {loading ? (
        <section className={styles.loading} aria-live="polite">Cargando presupuesto de {formatMonth(month)}…</section>
      ) : snapshot ? (
        <>
          <section className={styles.metrics} aria-label="Resumen del presupuesto mensual">
            <Metric label="Presupuesto" value={formatMoney(snapshot.total.effectiveAmountCents)} note={snapshot.total.manualAmountCents === null ? "Automático" : "Límite manual"} />
            <Metric label="Gastado" value={formatMoney(snapshot.total.actualExpenseCents)} note={formatMonth(snapshot.month)} />
            <Metric label={snapshot.total.remainingCents >= 0 ? "Disponible" : "Exceso"} value={formatMoney(Math.abs(snapshot.total.remainingCents))} note={snapshot.total.status === "over" ? "Límite superado" : "Margen del mes"} />
            <Metric label="Consumo" value={formatProgress(snapshot.total.progressBps)} note={`${summary.over} superadas · ${summary.near} cerca del límite`} />
          </section>

          {attention.length ? (
            <section className={styles.attention} aria-labelledby="budget-attention-title">
              <div className={styles.sectionHeading}>
                <div><p className={styles.kicker}>PRIORIDAD</p><h2 id="budget-attention-title">Necesita atención</h2></div>
                <span>{attention.length} {attention.length === 1 ? "categoría" : "categorías"}</span>
              </div>
              <div className={styles.attentionGrid}>
                {attention.map((item) => (
                  <Link key={item.categoryId ?? item.categoryName} href={`/transactions?dateFrom=${snapshot.monthStart}&dateTo=${snapshot.monthEnd}&kind=expense&categoryId=${encodeURIComponent(item.categoryId ?? "")}`}>
                    <strong>{item.categoryName ?? "Categoría"}</strong>
                    <span>{item.status === "over" ? `Exceso ${formatMoney(Math.abs(item.remainingCents))}` : `${formatProgress(item.progressBps)} consumido`}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.layout}>
            <div className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div><p className={styles.kicker}>CONTROL DEL MES</p><h2>Límites y gasto real</h2></div>
                <span>{formatMonth(snapshot.month)}</span>
              </div>
              <p className={styles.srContext}>Total mensual y detalle por categorías de gasto.</p>
              <div className={styles.budgetList}>
                <BudgetRow
                  item={snapshot.total}
                  monthStart={snapshot.monthStart}
                  monthEnd={snapshot.monthEnd}
                  busy={busy}
                  editor={editor}
                  onEdit={startEdit}
                  onEditValue={(value) => setEditor((current) => current ? { ...current, value, error: "" } : current)}
                  onCancel={() => setEditor(null)}
                  onSave={saveManual}
                  onClear={clearManual}
                />
                {orderedCategories.map((item) => (
                  <BudgetRow
                    key={item.categoryId ?? item.id ?? item.categoryName ?? "category"}
                    item={item}
                    monthStart={snapshot.monthStart}
                    monthEnd={snapshot.monthEnd}
                    busy={busy}
                    editor={editor}
                    onEdit={startEdit}
                    onEditValue={(value) => setEditor((current) => current ? { ...current, value, error: "" } : current)}
                    onCancel={() => setEditor(null)}
                    onSave={saveManual}
                    onClear={clearManual}
                  />
                ))}
                {orderedCategories.length === 0 ? (
                  <div className={styles.emptyState}>
                    <strong>No hay categorías de gasto activas</strong>
                    <p>El presupuesto total ya funciona. Cuando existan categorías de gasto activas, aparecerán aquí con su recomendación y consumo real.</p>
                    <Link href="/configuration">Abrir Configuración</Link>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className={styles.sidePanel}>
              <div className={styles.sectionHeading}><div><p className={styles.kicker}>REFERENCIA</p><h2>Gasto reciente</h2></div></div>
              <div className={styles.history} aria-label="Histórico de gasto usado para recomendar presupuesto">
                {snapshot.total.historyMonths.map((row) => {
                  const maximum = Math.max(1, ...snapshot.total.historyMonths.map((entry) => entry.expenseCents));
                  return (
                    <div className={styles.historyRow} key={row.month}>
                      <span>{formatMonth(row.month).split(" de ")[0]}</span>
                      <div aria-hidden="true"><i style={{ width: `${Math.max(3, row.expenseCents / maximum * 100)}%` }} /></div>
                      <strong>{formatMoney(row.expenseCents)}</strong>
                    </div>
                  );
                })}
              </div>
              <p className={styles.explanation}>{snapshot.total.automaticExplanation}</p>
              <details className={styles.method}>
                <summary>Cómo se calcula</summary>
                <div>
                  <p>La fuente bancaria se mantiene estrictamente en solo lectura.</p>
                  <p>Transferencias internas, duplicados confirmados y exclusiones manuales no consumen presupuesto.</p>
                  <p>Un límite manual tiene prioridad sin borrar la recomendación automática.</p>
                  <p>Las categorías padre incluyen sus subcategorías para evitar duplicar gasto.</p>
                </div>
              </details>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
