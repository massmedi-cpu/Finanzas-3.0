"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";
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

type BudgetIconName = Extract<
  ProductIconName,
  "wallet" | "spent" | "remaining" | "progress" | "spark" | "category" | "refresh" | "warning"
>;

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

const exactPercentFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

function shortMonth(value: string) {
  return formatMonth(value).replace(/ de /g, " ").split(" ")[0];
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

function normalizeSpanishInteger(value: string) {
  if (/^\d+$/.test(value)) return value;
  const groups = value.split(".");
  if (
    groups.length < 2 ||
    !/^\d{1,3}$/.test(groups[0] ?? "") ||
    groups.slice(1).some((group) => !/^\d{3}$/.test(group))
  ) {
    return null;
  }
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
    const normalizedInteger = normalizeSpanishInteger(integerRaw);
    if (normalizedInteger === null) return undefined;
    integerPart = normalizedInteger;
    decimalPart = decimalRaw;
  } else if (compact.includes(".")) {
    const pieces = compact.split(".");
    if (
      pieces.length === 2 &&
      /^\d+$/.test(pieces[0] ?? "") &&
      /^\d{1,2}$/.test(pieces[1] ?? "")
    ) {
      integerPart = pieces[0];
      decimalPart = pieces[1];
    } else {
      const normalizedInteger = normalizeSpanishInteger(compact);
      if (normalizedInteger === null) return undefined;
      integerPart = normalizedInteger;
    }
  } else {
    integerPart = compact;
  }

  if (!/^\d+$/.test(integerPart)) return undefined;
  const euros = Number(`${integerPart}.${decimalPart.padEnd(2, "0") || "00"}`);
  const cents = Math.round(euros * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : undefined;
}

function Icon({ name }: { name: BudgetIconName }) {
  return <ProductIcon name={name} size={18} />;
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
  monthStart,
  monthEnd,
  busy,
  editing,
  editValue,
  fieldError,
  onStartEdit,
  onChangeEdit,
  onCancelEdit,
  onSave,
  onClearManual,
}: {
  item: BudgetItem;
  total?: boolean;
  monthStart: string;
  monthEnd: string;
  busy: boolean;
  editing: boolean;
  editValue: string;
  fieldError: string;
  onStartEdit: () => void;
  onChangeEdit: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onClearManual: () => void;
}) {
  const remainingLabel = item.remainingCents >= 0 ? "Disponible" : "Exceso";
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldErrorId = `budget-manual-error-${total ? "total" : item.categoryId ?? "category"}`;
  const excessCents = Math.max(0, -item.remainingCents);
  const excessPercent = item.effectiveAmountCents > 0 ? (excessCents / item.effectiveAmountCents) * 100 : null;
  const causalHref = item.categoryId
    ? `/transactions?dateFrom=${monthStart}&dateTo=${monthEnd}&kind=expense&categoryId=${encodeURIComponent(item.categoryId)}`
    : null;

  useEffect(() => {
    if (fieldError) inputRef.current?.focus();
  }, [fieldError]);

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

      {!total && item.status === "over" && causalHref ? (
        <div
          role="group"
          aria-label={`Magnitud del presupuesto · ${item.categoryName ?? "Categoría"}`}
          data-budget-state={item.status}
          style={{
            marginTop: ".9rem",
            padding: ".85rem .95rem",
            borderRadius: ".9rem",
            border: "1px solid rgba(255,118,139,.28)",
            background: "linear-gradient(135deg, rgba(255,91,118,.10), rgba(255,255,255,.025))",
            display: "grid",
            gap: ".55rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>Exceso {formatMoney(excessCents)}</strong>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {excessPercent === null ? "Sin base de comparación" : `${exactPercentFormatter.format(excessPercent)} % sobre el límite`}
            </span>
          </div>
          <div aria-hidden="true" style={{ height: ".5rem", borderRadius: "999px", overflow: "hidden", background: "rgba(255,255,255,.08)" }}>
            <div
              style={{
                width: `${Math.min(100, excessPercent ?? 0)}%`,
                minWidth: excessCents > 0 ? ".45rem" : 0,
                height: "100%",
                borderRadius: "inherit",
                background: "linear-gradient(90deg, rgba(255,103,130,.78), rgba(255,171,111,.82))",
              }}
            />
          </div>
          <Link
            href={causalHref}
            aria-label={`Ver movimientos que explican el gasto de ${item.categoryName ?? "Categoría"}`}
            style={{ width: "fit-content", fontWeight: 700, textDecoration: "none" }}
          >
            Ver movimientos que explican el gasto
          </Link>
        </div>
      ) : null}

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
              ref={inputRef}
              inputMode="decimal"
              value={editValue}
              onChange={(event) => onChangeEdit(event.target.value)}
              placeholder={euroInputFromCents(item.effectiveAmountCents)}
              aria-label={`Presupuesto manual de ${total ? "total mensual" : item.categoryName ?? "categoría"}`}
              aria-invalid={fieldError ? "true" : "false"}
              aria-describedby={fieldError ? fieldErrorId : undefined}
            />
            {fieldError ? (
              <span
                id={fieldErrorId}
                role="alert"
                style={{ color: "#ff9aaa", fontSize: "0.875rem", lineHeight: 1.35 }}
              >
                {fieldError}
              </span>
            ) : null}
          </label>
          <div className={styles.editorButtons}>
            <button className={styles.secondaryButton} type="button" onClick={onCancelEdit} disabled={busy}>Cancelar</button>
            <button className={styles.actionButton} type="button" onClick={onSave} disabled={busy}>Guardar</button>
          </div>
        </div>
      ) : null}

      {total ? (
        <p className={styles.helper}>
          El gasto mostrado procede de tus movimientos. El presupuesto nunca modifica la fuente bancaria.
        </p>
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
  const [notice, setNotice] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [fieldError, setFieldError] = useState("");
  const fetchGeneration = useRef(0);

  const fetchSnapshot = useCallback(async (selectedMonth: string) => {
    const generation = ++fetchGeneration.current;
    setLoading(true);
    setError("");
    setNotice("");
    setFieldError("");
    try {
      const response = await fetch(`/api/budgets?month=${encodeURIComponent(selectedMonth)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (generation !== fetchGeneration.current) return;
      if (!response.ok || !payload) throw new Error(readableError(payload));
      const nextSnapshot = payload as BudgetSnapshot;
      if (nextSnapshot.month !== selectedMonth) {
        throw new Error("El servidor devolvió un presupuesto de otro mes.");
      }
      setSnapshot(nextSnapshot);
      setEditingKey(null);
    } catch (caught) {
      if (generation !== fetchGeneration.current) return;
      setSnapshot(null);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los presupuestos.");
    } finally {
      if (generation === fetchGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(month);
  }, [fetchSnapshot, month]);

  const mutate = useCallback(async (
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    setFieldError("");
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
      setNotice(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el presupuesto.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    void mutate("POST", { month }, `Presupuesto de ${formatMonth(month)} recalculado y guardado.`);
  }, [month, mutate]);

  const startEdit = useCallback((item: BudgetItem) => {
    const key = item.categoryId ?? "__total__";
    setError("");
    setNotice("");
    setFieldError("");
    setEditingKey(key);
    setEditValue(euroInputFromCents(item.manualAmountCents ?? item.effectiveAmountCents));
  }, []);

  const changeEditValue = useCallback((value: string) => {
    setEditValue(value);
    setFieldError("");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setFieldError("");
  }, []);

  const saveManual = useCallback((item: BudgetItem) => {
    const cents = parseEuroInput(editValue);
    if (cents === undefined || cents === null) {
      setError("");
      setFieldError("Introduce un importe válido con un máximo de dos decimales.");
      setNotice("");
      return;
    }
    setFieldError("");
    void mutate(
      "PATCH",
      { month, categoryId: item.categoryId, manualAmountCents: cents },
      "Límite manual guardado.",
    );
  }, [editValue, month, mutate]);

  const clearManual = useCallback((item: BudgetItem) => {
    void mutate(
      "PATCH",
      { month, categoryId: item.categoryId, manualAmountCents: null },
      "Se ha restaurado el cálculo automático.",
    );
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
          <p className={styles.eyebrow}>FINANCIAL APP · PRESUPUESTOS</p>
          <h1 id="budget-title">Presupuestos</h1>
          <p className={styles.heroText}>
            Controla cuánto quieres gastar cada mes, compara el límite con tus gastos reales y ajusta las categorías cuando lo necesites.
          </p>
        </div>

        <div className={styles.heroControls} aria-label="Controles de presupuesto">
          <label className={styles.monthField}>
            Mes
            <input
              type="month"
              min="0001-01"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
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
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

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
                      monthStart={snapshot.monthStart}
                      monthEnd={snapshot.monthEnd}
                      busy={busy}
                      editing={editingKey === "__total__"}
                      editValue={editValue}
                      fieldError={editingKey === "__total__" ? fieldError : ""}
                      onStartEdit={() => startEdit(snapshot.total)}
                      onChangeEdit={changeEditValue}
                      onCancelEdit={cancelEdit}
                      onSave={() => saveManual(snapshot.total)}
                      onClearManual={() => clearManual(snapshot.total)}
                    />

                    {snapshot.categories.map((item) => (
                      <BudgetCard
                        key={item.categoryId ?? item.id ?? item.categoryName ?? "category"}
                        item={item}
                        monthStart={snapshot.monthStart}
                        monthEnd={snapshot.monthEnd}
                        busy={busy}
                        editing={editingKey === item.categoryId}
                        editValue={editValue}
                        fieldError={editingKey === item.categoryId ? fieldError : ""}
                        onStartEdit={() => startEdit(item)}
                        onChangeEdit={changeEditValue}
                        onCancelEdit={cancelEdit}
                        onSave={() => saveManual(item)}
                        onClearManual={() => clearManual(item)}
                      />
                    ))}

                    {snapshot.categories.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span className={styles.cardIcon} style={{ margin: "0 auto" }}><Icon name="category" /></span>
                        <strong>No hay categorías de gasto activas</strong>
                        <p>
                          El presupuesto total ya funciona. Cuando existan categorías de gasto activas, aparecerán aquí con su recomendación y consumo real.
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
                      <p>Reglas visibles para entender el presupuesto.</p>
                    </div>
                    <span className={styles.cardIcon}><Icon name="spark" /></span>
                  </div>

                  <div className={styles.history} aria-label="Histórico de gasto usado para recomendar presupuesto">
                    {snapshot.total.historyMonths.map((row) => {
                      const maximum = Math.max(1, ...snapshot.total.historyMonths.map((entry) => entry.expenseCents));
                      return (
                        <div className={styles.historyRow} key={row.month}>
                          <span>{shortMonth(row.month)}</span>
                          <div className={styles.historyBar}><i style={{ width: `${Math.max(3, (row.expenseCents / maximum) * 100)}%` }} /></div>
                          <strong>{formatMoney(row.expenseCents)}</strong>
                        </div>
                      );
                    })}
                  </div>

                  <p className={styles.explanation}>{snapshot.total.automaticExplanation}</p>

                  <div className={styles.principles}>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>La fuente bancaria se mantiene estrictamente en solo lectura.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>El gasto se calcula con los mismos movimientos efectivos que utiliza el resto de Financial App.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las transferencias internas no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Los duplicados confirmados y las exclusiones manuales no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Un límite manual tiene prioridad sin borrar la recomendación automática.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las categorías padre incluyen sus subcategorías para evitar contar el mismo gasto dos veces.</span></div>
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
