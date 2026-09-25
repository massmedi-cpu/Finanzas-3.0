"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBasisPoints, formatNumberWithDigits } from "../../src/core/formatters";
import { formatMoneyCents as formatMoney, formatMoneyInputCents, parseMoneyInputToCents } from "../../src/core/money";
import {
  assembleBudgetPlanning,
  type BudgetItem,
  type BudgetPlanningContext,
  type BudgetSnapshot,
} from "../../src/application/budgets/budget-planning";
import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";
import styles from "./budgets.module.css";

type BudgetIconName = Extract<
  ProductIconName,
  "wallet" | "spent" | "remaining" | "progress" | "spark" | "category" | "refresh" | "warning"
>;

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
  return formatBasisPoints(bps, 1, "%", 0);
}

function formatExactRate(bps: number | null) {
  if (bps === null) return "—";
  return formatBasisPoints(bps, 2);
}

function progressWidth(item: BudgetItem) {
  if (item.progressBps === null || item.progressBps <= 0) return 0;
  return Math.min(100, item.progressBps / 100);
}

function readableError(payload: any) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (code.includes("budget_month")) return "El mes seleccionado no es válido.";
  if (code.includes("budget_manual_amount")) return "El límite elegido debe ser un importe positivo o cero.";
  if (code.includes("budget_category_not_found")) return "La categoría ya no está disponible. Actualiza los presupuestos.";
  if (code.includes("budget_category_must_be_expense")) return "Solo las categorías de gasto pueden tener presupuesto.";
  if (payload?.error === "authentication_required") return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  return "No se pudo completar la operación de presupuestos.";
}

function euroInputFromCents(cents: number | null) {
  if (cents === null) return "";
  return formatMoneyInputCents(cents);
}

function parseEuroInput(value: string) {
  if (!value.trim()) return null;
  try {
    const cents = parseMoneyInputToCents(value);
    return cents >= 0 ? cents : undefined;
  } catch {
    return undefined;
  }
}

function Icon({ name }: { name: BudgetIconName }) {
  return <ProductIcon name={name} size={18} />;
}

function statusLabel(item: BudgetItem) {
  const hasChosenLimit = item.manualAmountCents !== null;
  if (item.status === "over") return hasChosenLimit ? "Límite superado" : "Sobre lo habitual";
  if (item.status === "unfunded") return hasChosenLimit ? "Límite en cero" : "Sin referencia";
  if (item.status === "empty") return "Sin actividad";
  return hasChosenLimit ? "Dentro del límite" : "Dentro de referencia";
}

function limitDifferenceText(planning: BudgetPlanningContext) {
  const difference = planning.differenceFromBaselineCents;
  if (difference === null) return "Todavía no has convertido la referencia histórica en un límite propio.";
  if (difference === 0) return "Coincide exactamente con tu gasto habitual de los tres meses anteriores.";
  if (difference < 0) return `Reduce en ${formatMoney(Math.abs(difference))} tu gasto habitual mensual.`;
  return `Permite ${formatMoney(difference)} más que tu gasto habitual mensual.`;
}

function objectiveValue(planning: BudgetPlanningContext) {
  if (planning.objectiveState === "needs_limit") return "Pendiente";
  if (planning.objectiveState !== "ready" || planning.targetSavingsCents === null) return "No disponible";
  return formatMoney(planning.targetSavingsCents);
}

function objectiveSummary(planning: BudgetPlanningContext | null) {
  if (!planning || planning.objectiveState === "unavailable") return "Contexto de ingresos no disponible";
  if (planning.objectiveState === "needs_limit") return "Necesita un límite total elegido";
  if (planning.objectiveState === "no_income") return "Sin ingresos históricos suficientes";
  if (planning.objectiveState === "mismatch") return "Datos históricos sin conciliar";
  return `${formatExactRate(planning.targetSavingsRateBps)} del ingreso medio`;
}

function objectiveText(planning: BudgetPlanningContext) {
  if (planning.objectiveState === "needs_limit") {
    return "Define un límite total para calcular el ahorro que implicaría.";
  }
  if (planning.objectiveState === "no_income") {
    return "No hay ingresos históricos suficientes para calcular un objetivo sostenible.";
  }
  if (planning.objectiveState === "mismatch") {
    return "El histórico de ingresos y el de gastos no concilian; no se muestra una cifra dudosa.";
  }
  if (planning.objectiveState === "unavailable") {
    return "El contexto de ingresos no está disponible ahora; tus límites y gastos siguen intactos.";
  }
  if (planning.averageIncomeCents === null || planning.targetSavingsCents === null) return "No disponible.";
  const rate = formatExactRate(planning.targetSavingsRateBps);
  if (planning.targetSavingsCents < 0) {
    return `El límite supera en ${formatMoney(Math.abs(planning.targetSavingsCents))} el ingreso medio de ${formatMoney(planning.averageIncomeCents)} (${rate}).`;
  }
  return `Con un ingreso medio de ${formatMoney(planning.averageIncomeCents)}, ese límite dejaría ${rate} para ahorro.`;
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
  const hasChosenLimit = item.manualAmountCents !== null;
  const referenceLabel = hasChosenLimit ? "Límite elegido" : "Gasto habitual";
  const remainingLabel = item.remainingCents >= 0
    ? hasChosenLimit ? "Margen del límite" : "Margen histórico"
    : hasChosenLimit ? "Exceso del límite" : "Sobre lo habitual";
  const comparisonLabel = hasChosenLimit ? "Uso del límite" : "Comparación con lo habitual";
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
    <article
      id={total ? "budget-total" : undefined}
      className={`${styles.budgetCard} ${total ? styles.budgetCardPrimary : ""}`}
    >
      <div className={styles.cardTop}>
        <div className={styles.cardTitle}>
          <span className={styles.cardIcon}><Icon name={total ? "wallet" : "category"} /></span>
          <div>
            <h3>{total ? "Presupuesto mensual total" : item.categoryName ?? "Categoría"}</h3>
            <p>
              {hasChosenLimit
                ? "Límite elegido por ti"
                : "Referencia histórica · media de 3 meses"}
              {!total && item.categoryLifecycle === "archived" ? " · categoría archivada" : ""}
            </p>
          </div>
        </div>
        <span className={`${styles.status} ${styles[item.status]}`}>{statusLabel(item)}</span>
      </div>

      <div className={styles.amounts}>
        <div>
          <span>{referenceLabel}</span>
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
        <span>{comparisonLabel}</span>
        <strong>{formatProgress(item.progressBps)}</strong>
      </div>
      <div className={styles.progressTrack} aria-label={`${comparisonLabel} ${formatProgress(item.progressBps)}`}>
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
              {excessPercent === null
                ? "Sin base de comparación"
                : `${formatNumberWithDigits(excessPercent, 2)} % ${hasChosenLimit ? "sobre el límite" : "sobre lo habitual"}`}
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
          <Link prefetch={false}
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
          {hasChosenLimit ? "Editar límite elegido" : "Definir límite"}
        </button>
        {hasChosenLimit ? (
          <>
            <span className={styles.manualBadge}>Gasto habitual {formatMoney(item.automaticAmountCents)}</span>
            <button className={styles.textButton} type="button" onClick={onClearManual} disabled={busy}>
              Quitar límite elegido
            </button>
          </>
        ) : null}
      </div>

      {editing ? (
        <div className={styles.editor}>
          <label>
            Límite mensual (€)
            <input
              autoFocus
              ref={inputRef}
              inputMode="decimal"
              value={editValue}
              onChange={(event) => onChangeEdit(event.target.value)}
              placeholder={euroInputFromCents(item.effectiveAmountCents)}
              aria-label={`Límite elegido de ${total ? "total mensual" : item.categoryName ?? "categoría"}`}
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
          El gasto mostrado procede de tus movimientos. La referencia histórica describe el pasado y no es una recomendación financiera.
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
    void mutate("POST", { month }, `Referencias históricas de ${formatMonth(month)} actualizadas.`);
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
      "Límite elegido guardado.",
    );
  }, [editValue, month, mutate]);

  const clearManual = useCallback((item: BudgetItem) => {
    void mutate(
      "PATCH",
      { month, categoryId: item.categoryId, manualAmountCents: null },
      "Se ha quitado el límite elegido. El histórico vuelve a usarse sólo como referencia.",
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

  const planning = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.planning ?? assembleBudgetPlanning(snapshot, null).planning;
  }, [snapshot]);

  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="budget-title">
        <div className={styles.heroCopy}>
          <Link prefetch={false} className={styles.backLink} href="/">← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · PRESUPUESTOS</p>
          <h1 id="budget-title">Presupuestos</h1>
          <p className={styles.heroText}>
            Distingue lo que sueles gastar, el límite que eliges y el ahorro que ese límite permitiría con tus ingresos reales.
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
            {busy ? "Actualizando…" : "Actualizar referencias"}
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
                <span className={styles.metricLabel}><Icon name="wallet" /> Gasto habitual</span>
                <strong>{formatMoney(snapshot.total.automaticAmountCents)}</strong>
                <small>Media real de los 3 meses completos anteriores</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="remaining" /> Límite elegido</span>
                <strong>{snapshot.total.manualAmountCents === null ? "Sin definir" : formatMoney(snapshot.total.manualAmountCents)}</strong>
                <small>{snapshot.total.manualAmountCents === null ? "El histórico no se presenta como recomendación" : "Objetivo mensual definido por ti"}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="spent" /> Gastado</span>
                <strong>{formatMoney(snapshot.total.actualExpenseCents)}</strong>
                <small>Gasto elegible de {formatMonth(snapshot.month)}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="progress" /> Ahorro objetivo</span>
                <strong>{planning ? objectiveValue(planning) : "No disponible"}</strong>
                <small>{objectiveSummary(planning)}</small>
              </article>
            </section>

            {planning ? (
              <section
                className={styles.planningPanel}
                aria-labelledby="budget-planning-title"
                data-planning-state={planning.state}
                data-objective-state={planning.objectiveState}
              >
                <div className={styles.planningHeader}>
                  <div>
                    <p className={styles.planningEyebrow}>PLANIFICACIÓN CON DATOS REALES</p>
                    <h2 id="budget-planning-title">De lo habitual a tu objetivo</h2>
                    <p>Cada cifra cumple una función distinta: referencia, decisión y resultado esperado.</p>
                  </div>
                  <span className={`${styles.status} ${styles[snapshot.total.status]}`}>
                    {categorySummary.total
                      ? `${categorySummary.onTrack} dentro · ${categorySummary.over} por encima`
                      : "Sin categorías activas"}
                  </span>
                </div>

                <div className={styles.planningSteps}>
                  <article className={styles.planningStep}>
                    <span className={styles.stepNumber}>1</span>
                    <div>
                      <span className={styles.stepLabel}>Referencia histórica</span>
                      <strong>{formatMoney(planning.historicalBaselineCents)}</strong>
                      <p>Es lo que gastaste de media. Describe el pasado; no recomienda cuánto deberías gastar.</p>
                    </div>
                  </article>

                  <article className={styles.planningStep}>
                    <span className={styles.stepNumber}>2</span>
                    <div>
                      <span className={styles.stepLabel}>Límite elegido</span>
                      <strong>{planning.selectedLimitCents === null ? "Sin definir" : formatMoney(planning.selectedLimitCents)}</strong>
                      <p>{limitDifferenceText(planning)}</p>
                      {planning.selectedLimitCents === null ? (
                        <button
                          className={styles.stepLink}
                          type="button"
                          onClick={() => startEdit(snapshot.total)}
                          disabled={busy}
                        >
                          Definir mi límite mensual
                        </button>
                      ) : null}
                    </div>
                  </article>

                  <article className={`${styles.planningStep} ${
                    planning.objectiveState === "ready" && (planning.targetSavingsCents ?? 0) < 0
                      ? styles.planningStepRisk
                      : ""
                  }`}>
                    <span className={styles.stepNumber}>3</span>
                    <div>
                      <span className={styles.stepLabel}>Objetivo de ahorro resultante</span>
                      <strong>{objectiveValue(planning)}</strong>
                      <p>{objectiveText(planning)}</p>
                    </div>
                  </article>
                </div>

                <p className={styles.planningNote}>
                  Es una proyección determinista con tus tres meses completos anteriores; no es asesoramiento financiero ni modifica la fuente bancaria.
                </p>
              </section>
            ) : null}

            <section className={styles.mainGrid}>
              <div className={styles.panel}>
                <div className={styles.panelInner}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Límites y referencias del mes</h2>
                      <p>Tu límite elegido tiene prioridad; sin él, el histórico se usa sólo para comparar.</p>
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
                          El total ya muestra gasto habitual, límite elegido y consumo real. Cuando existan categorías de gasto activas, aparecerán aquí con la misma separación.
                        </p>
                        <Link prefetch={false} href="/configuration">Abrir Configuración</Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <aside className={styles.panel}>
                <div className={styles.panelInner}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Qué significa cada cifra</h2>
                      <p>Origen y reglas para interpretar el presupuesto sin confundir referencia y objetivo.</p>
                    </div>
                    <span className={styles.cardIcon}><Icon name="spark" /></span>
                  </div>

                  <div className={styles.history} aria-label="Histórico usado para calcular el gasto habitual">
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
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Un límite elegido tiene prioridad sin borrar la referencia histórica.</span></div>
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
