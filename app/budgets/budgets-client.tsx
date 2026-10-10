"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBasisPoints, formatNumberWithDigits } from "../../src/core/formatters";
import { formatMoneyCents as formatMoney, formatMoneyInputCents, parseMoneyInputToCents } from "../../src/core/money";
import {
  assembleBudgetPlanning,
  isBudgetSnapshot,
  type BudgetItem,
  type BudgetPlanningContext,
  type BudgetSnapshot,
} from "../../src/application/budgets/budget-planning";
import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";
import { resolvePeriodCoverage, type PeriodCoverage } from "../../src/application/data-coverage";
import type { SourceFreshness } from "../analysis/analysis-source-freshness";
import { useActionFeedback } from "../action-feedback";
import { CategoryIdentity } from "../category-identity";
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

function readableError(payload: any, afterWrite = false) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (code.includes("budget_month")) return "El mes seleccionado no es válido.";
  if (code.includes("budget_manual_amount")) return "El límite elegido debe ser un importe positivo o cero.";
  if (code.includes("budget_category_not_found")) return "La categoría ya no está disponible. Actualiza los presupuestos.";
  if (code.includes("budget_category_must_be_expense")) return "Solo las categorías de gasto pueden tener presupuesto.";
  if (payload?.error === "authentication_required") return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  if (code === "invalid_budget_snapshot") {
    return afterWrite
      ? "La respuesta al guardado es incoherente. Comprueba el límite al recargar antes de repetir la operación."
      : "La información de presupuestos no es válida. No se mostrarán cifras incoherentes; reintenta la consulta.";
  }
  if (payload?.error === "persistence_failed") {
    return afterWrite
      ? "No se ha podido confirmar si el cambio se guardó. Recarga el presupuesto y comprueba el límite antes de volver a guardarlo."
      : "Presupuestos no ha podido terminar el cálculo. Puedes reintentar esta consulta sin modificar límites.";
  }
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

function statusLabel(item: BudgetItem, coverageVerified: boolean) {
  if (!coverageVerified) return "Estado sin verificar";
  const hasChosenLimit = item.manualAmountCents !== null;
  if (item.status === "over") return hasChosenLimit ? "Límite superado" : "Sobre la referencia";
  if (item.status === "unfunded") return hasChosenLimit ? "Límite en cero" : "Sin referencia";
  if (item.status === "empty") return "Sin actividad";
  return hasChosenLimit ? "Dentro del límite" : "Dentro de referencia";
}

function limitDifferenceText(planning: BudgetPlanningContext) {
  const difference = planning.differenceFromBaselineCents;
  if (difference === null) return "Todavía no has convertido la referencia automática en un límite propio.";
  if (difference === 0) return "Coincide exactamente con la referencia automática calculada para este mes.";
  if (difference < 0) return `Reduce en ${formatMoney(Math.abs(difference))} la referencia automática mensual.`;
  return `Permite ${formatMoney(difference)} más que la referencia automática mensual.`;
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
  coverageVerified,
  expenseObserved,
  monthStart,
  monthEnd,
  busy,
  editing,
  editLocked,
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
  coverageVerified: boolean;
  expenseObserved: boolean;
  monthStart: string;
  monthEnd: string;
  busy: boolean;
  editing: boolean;
  editLocked: boolean;
  editValue: string;
  fieldError: string;
  onStartEdit: () => void;
  onChangeEdit: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onClearManual: () => void;
}) {
  const hasChosenLimit = item.manualAmountCents !== null;
  // Sin referencia histórica no equivale a haber elegido un límite de 0 €.
  const withoutReference = !hasChosenLimit && item.status === "unfunded";
  const referenceLabel = withoutReference ? "Referencia no disponible" : hasChosenLimit ? "Límite elegido" : "Referencia automática";
  const remainingLabel = !coverageVerified ? "Margen sin verificar" : withoutReference ? "Margen no calculable"
    : item.remainingCents >= 0
      ? hasChosenLimit ? "Margen del límite" : "Margen de referencia"
      : hasChosenLimit ? "Exceso del límite" : "Sobre la referencia";
  const comparisonLabel = !coverageVerified ? "Uso sin verificar" : withoutReference ? "Cobertura del gasto" : hasChosenLimit ? "Uso del límite" : "Uso de la referencia";
  const progressLabel = !coverageVerified ? "Sin cobertura bancaria confirmada" : withoutReference ? "No calculable sin referencia"
    : hasChosenLimit && item.effectiveAmountCents === 0
      ? item.actualExpenseCents > 0 ? "Límite 0 € superado" : "Límite 0 € sin gasto"
      : formatProgress(item.progressBps);
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
          <span className={styles.cardIcon}>{total ? <Icon name="wallet" /> : <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} iconOnly />}</span>
          <div>
            <h3>{total ? "Presupuesto mensual total" : item.categoryName ?? "Categoría"}</h3>
            <p>
              {hasChosenLimit
                ? "Límite elegido por ti"
                : withoutReference
                  ? "Sin histórico suficiente para fijar una referencia"
                  : "Referencia automática · Axioma §52"}
              {!total && item.categoryLifecycle === "archived" ? " · categoría archivada" : ""}
            </p>
          </div>
        </div>
        <span className={`${styles.status} ${coverageVerified ? styles[item.status] : ""}`}>{statusLabel(item, coverageVerified)}</span>
      </div>

      <div className={styles.amounts}>
        <div>
          <span>{referenceLabel}</span>
          <strong>{withoutReference ? "—" : formatMoney(item.effectiveAmountCents)}</strong>
        </div>
        <div>
          <span>{coverageVerified ? "Gastado" : expenseObserved ? "Gasto observado · parcial" : "Gasto sin confirmar"}</span>
          <strong>{expenseObserved ? formatMoney(item.actualExpenseCents) : "—"}</strong>
        </div>
        <div>
          <span>{remainingLabel}</span>
          <strong>{!coverageVerified || withoutReference ? "—" : formatMoney(Math.abs(item.remainingCents))}</strong>
        </div>
      </div>

      <div className={styles.progressMeta}>
        <span>{comparisonLabel}</span>
        <strong>{progressLabel}</strong>
      </div>
      <div className={styles.progressTrack} role="img" aria-label={`${comparisonLabel}: ${progressLabel}`}>
        <div
          className={`${styles.progressFill} ${item.status === "over" ? styles.progressOver : ""}`}
          style={{ width: `${coverageVerified ? progressWidth(item) : 0}%` }}
        />
      </div>

      {coverageVerified && !total && (item.status === "over" || (item.status === "unfunded" && item.actualExpenseCents > 0)) && causalHref ? (
        <div
          role="group"
          aria-label={`Magnitud del presupuesto · ${item.categoryName ?? "Categoría"}`}
          data-budget-state={item.status}
          className={withoutReference ? `${styles.excessPanel} ${styles.noReferencePanel}` : styles.excessPanel}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{withoutReference ? "Gasto sin referencia" : "Exceso"} {formatMoney(withoutReference ? item.actualExpenseCents : excessCents)}</strong>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {withoutReference
                ? "Falta histórico o límite elegido para calcular un exceso."
                : excessPercent === null
                  ? "No existe un porcentaje calculable con límite 0 €"
                  : `${formatNumberWithDigits(excessPercent, 2)} % ${hasChosenLimit ? "sobre el límite" : "sobre la referencia"}`}
            </span>
          </div>
          {!withoutReference ? (
            <div aria-hidden="true" className={styles.excessTrack}>
              <div className={styles.excessFill} style={{
                width: `${Math.min(100, excessPercent ?? 0)}%`,
                minWidth: excessCents > 0 ? ".45rem" : 0,
              }} />
            </div>
          ) : null}
          <Link prefetch={false}
            href={causalHref}
            aria-label={`Ver movimientos que explican el gasto de ${item.categoryName ?? "Categoría"}`}
            className={styles.excessLink}
          >
            Ver movimientos que explican el gasto
          </Link>
        </div>
      ) : null}

      {!total && item.actualExpenseCents > 0 && causalHref && (!coverageVerified || (item.status !== "over"
        && !(item.status === "unfunded" && item.actualExpenseCents > 0))) ? (
        <Link className={styles.excessLink} prefetch={false} href={causalHref}>
          Ver movimientos de esta categoría
        </Link>
      ) : null}
      <div className={styles.cardActions}>
        <button className={styles.textButton} type="button" onClick={onStartEdit} disabled={busy || editLocked}>
          {hasChosenLimit ? "Editar límite elegido" : "Definir límite"}
        </button>
        {hasChosenLimit ? (
          <>
            <span className={styles.manualBadge}>Referencia automática {formatMoney(item.automaticAmountCents)}</span>
            <button className={styles.textButton} type="button" onClick={onClearManual} disabled={busy || editLocked}>
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
                className={styles.fieldError}
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
          El gasto procede de tus movimientos. La referencia automática combina señales históricas sin convertirse en una recomendación financiera.
        </p>
      ) : null}
    </article>
  );
}

export default function BudgetsClient({ initialMonth }: { initialMonth?: string }) {
  const actionFeedback = useActionFeedback();
  const [month, setMonth] = useState(() => initialMonth ?? currentMonthMadrid());
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryView, setCategoryView] = useState<"all" | "attention" | "manual">("all");
  const fetchGeneration = useRef(0);
  const fetchController = useRef<AbortController | null>(null);
  const [slowLoading, setSlowLoading] = useState(false);
  const [coverageCheck, setCoverageCheck] = useState<{ month: string; coverage: PeriodCoverage } | null>(null);

  // El importe presupuestado y la cobertura son preguntas distintas. Un
  // gasto observado de 0 € no demuestra que se hayan importado los movimientos.
  // No deducimos "dentro del límite" a partir del snapshot de presupuestos.
  useEffect(() => {
    const controller = new AbortController();
    setCoverageCheck(null);
    const [year, number] = month.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const lastDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
    const unknown: PeriodCoverage = { state: "unknown", latestMovementDate: null, throughDate: null };
    void fetch("/api/analysis/source-freshness", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json().catch(() => null) : null)
      .then((payload: unknown) => {
        if (controller.signal.aborted) return;
        const freshness = payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload as Partial<SourceFreshness> : null;
        // A malformed success payload must never certify a financial zero or
        // "within budget". Older endpoints may omit incident counts: until
        // they supply evidence, the coverage remains unverified.
        const sync = freshness?.sync;
        const validSync = sync && typeof sync === "object" && !Array.isArray(sync)
          && ["success", "failed", "started", "partial"].includes(sync.status)
          && [
            sync.rowsSeen, sync.rowsFailed, sync.rowsMissing,
            sync.duplicatesDetected, sync.warningsCount,
          ].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
        const valid = freshness?.available === true
          && (typeof freshness.latestMovementDate === "string" || freshness.latestMovementDate === null)
          && (freshness.earliestMovementDate === undefined || typeof freshness.earliestMovementDate === "string" || freshness.earliestMovementDate === null)
          && validSync;
        const coverage = valid
          ? resolvePeriodCoverage({
              dateFrom: `${month}-01`,
              dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
              latestMovementDate: freshness.latestMovementDate,
              earliestMovementDate: freshness.earliestMovementDate,
              sync,
            })
          : unknown;
        setCoverageCheck({ month, coverage });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCoverageCheck({ month, coverage: unknown });
      });
    return () => controller.abort();
  }, [month]);

  const budgetCoverage = coverageCheck?.month === month ? coverageCheck.coverage : null;
  const coverageVerified = budgetCoverage?.state === "covered";
  const expenseObserved = coverageVerified || budgetCoverage?.state === "partial";

  // La URL es parte del contexto de un presupuesto; permite recargar o compartir el mes sin perderlo.
  useEffect(() => {
    const next = new URL(window.location.href);
    if (next.searchParams.get("month") === month) return;
    next.searchParams.set("month", month);
    window.history.replaceState(window.history.state, "", `${next.pathname}${next.search}${next.hash}`);
  }, [month]);

  const fetchSnapshot = useCallback(async (selectedMonth: string) => {
    const generation = ++fetchGeneration.current;
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;
    let timedOut = false;
    const slowTimer = window.setTimeout(() => {
      if (!controller.signal.aborted && generation === fetchGeneration.current) setSlowLoading(true);
    }, 15_000);
    const deadlineTimer = window.setTimeout(() => {
      if (controller.signal.aborted || generation !== fetchGeneration.current) return;
      timedOut = true;
      controller.abort();
    }, 30_000);
    setSlowLoading(false);
    setLoading(true);
    setError("");
    setNotice("");
    setFieldError("");
    try {
      const response = await fetch(`/api/budgets?month=${encodeURIComponent(selectedMonth)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (generation !== fetchGeneration.current) return;
      if (!response.ok || !payload) throw new Error(readableError(payload));
      if (!isBudgetSnapshot(payload)) {
        throw new Error("La información de presupuestos no es válida. Reintenta la consulta.");
      }
      const nextSnapshot = payload;
      if (nextSnapshot.month !== selectedMonth) {
        throw new Error("El servidor devolvió un presupuesto de otro mes.");
      }
      setSnapshot(nextSnapshot);
      setEditingKey(null);
    } catch (caught) {
      if (generation !== fetchGeneration.current || (controller.signal.aborted && !timedOut)) return;
      setSnapshot(null);
      setError(timedOut
        ? "La consulta de presupuestos ha superado 30 segundos. No se han cambiado límites ni movimientos. Puedes reintentar solo esta lectura."
        : caught instanceof Error ? caught.message : "No se pudieron cargar los presupuestos.");
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(deadlineTimer);
      if (fetchController.current === controller) fetchController.current = null;
      if (generation === fetchGeneration.current && (!controller.signal.aborted || timedOut)) {
        setLoading(false);
        setSlowLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(month);
    return () => {
      fetchController.current?.abort();
      fetchGeneration.current += 1;
    };
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
    const feedbackId = method === "POST" ? "budgets:refresh" : "budgets:save-limit";
    actionFeedback.begin(feedbackId, method === "POST" ? "Actualizando referencias del presupuesto…" : "Guardando límite de presupuesto…");
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/budgets", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(readableError(payload, true));
      if (!isBudgetSnapshot(payload) || payload.month !== body.month) {
        throw new Error("No se pudo verificar la respuesta del guardado. La operación podría haberse aplicado: recarga y comprueba el límite antes de repetirla.");
      }
      setSnapshot(payload);
      setEditingKey(null);
      setEditValue("");
      setNotice(successMessage);
      actionFeedback.success(feedbackId, successMessage);
      return true;
    } catch (caught) {
      const message = controller.signal.aborted
        ? "La operación ha superado 30 segundos. No sabemos si llegó a guardarse: recarga y comprueba el límite antes de repetirla."
        : caught instanceof TypeError
          ? "Se perdió la conexión durante la operación. Es posible que el límite se haya guardado: recarga y compruébalo antes de repetirla."
        : caught instanceof Error ? caught.message
          : "No se ha podido confirmar el guardado. Recarga el presupuesto antes de volver a intentarlo.";
      setError(message);
      actionFeedback.error(feedbackId, message);
      return false;
    } finally {
      window.clearTimeout(deadline);
      setBusy(false);
    }
  }, [actionFeedback]);

  const handleRefresh = useCallback(() => {
    void mutate("POST", { month }, `Referencia automática de ${formatMonth(month)} actualizada.`);
  }, [month, mutate]);

  const startEdit = useCallback((item: BudgetItem) => {
    if (editingKey !== null) return;
    const key = item.categoryId ?? "__total__";
    setError("");
    setNotice("");
    setFieldError("");
    setEditingKey(key);
    setEditValue(euroInputFromCents(item.manualAmountCents ?? item.effectiveAmountCents));
  }, [editingKey]);

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
    if (editingKey !== null) return;
    void mutate(
      "PATCH",
      { month, categoryId: item.categoryId, manualAmountCents: null },
      "Se ha quitado el límite elegido. La referencia automática vuelve a aplicarse.",
    );
  }, [editingKey, month, mutate]);

  const categorySummary = useMemo(() => {
    if (!snapshot) return { attention: 0, onTrack: 0, total: 0 };
    return {
      attention: snapshot.categories.filter((item) =>
        item.status === "over" || (item.status === "unfunded" && item.actualExpenseCents > 0),
      ).length,
      onTrack: snapshot.categories.filter((item) => item.status === "on_track").length,
      total: snapshot.categories.length,
    };
  }, [snapshot]);

  const filteredCategories = useMemo(() => {
    if (!snapshot) return [];
    const normalized = categorySearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
    const needsAttention = (item: BudgetItem) =>
      item.status === "over" || (item.status === "unfunded" && item.actualExpenseCents > 0);
    return snapshot.categories.filter((item) => {
      const name = (item.categoryName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
      if (normalized && !name.includes(normalized)) return false;
      if (categoryView === "manual") return item.manualAmountCents !== null;
      if (categoryView === "attention") return needsAttention(item);
      return true;
    }).sort((left, right) => {
      if (needsAttention(left) !== needsAttention(right)) return needsAttention(left) ? -1 : 1;
      if (needsAttention(left) && needsAttention(right)) return left.remainingCents - right.remainingCents;
      return right.actualExpenseCents - left.actualExpenseCents
        || (left.categoryName ?? "").localeCompare(right.categoryName ?? "", "es-ES");
    });
  }, [snapshot, categorySearch, categoryView]);

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
            Consulta cuánto has gastado, identifica las categorías que superan su referencia y ajusta tus límites mensuales.
          </p>
        </div>

        <div className={styles.heroControls} role="group" aria-label="Controles de presupuesto">
          <label className={styles.monthField}>
            Mes
            <input
              type="month"
              min="0001-01"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
              disabled={busy || editingKey !== null}
              title={editingKey !== null ? "Guarda o cancela la edición antes de cambiar de mes" : undefined}
            />
          </label>
          <button className={styles.actionButton} type="button" onClick={handleRefresh} disabled={busy || loading || editingKey !== null}>
            <Icon name="refresh" />
            {busy ? "Actualizando…" : "Actualizar referencia"}
          </button>
        </div>
        {editingKey !== null ? (
          <p className={styles.editorGuardMessage} role="status">
            Tienes un límite en edición. Guárdalo o cancélalo antes de cambiar de mes o actualizar la referencia.
          </p>
        ) : null}
      </section>

      <div className={styles.content}>
        {error ? (
          <div className={styles.alert} role="alert">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        {loading || (snapshot !== null && snapshot.month !== month) ? (
          <section className={styles.panel}>
            <div className={styles.loading} aria-live="polite">
              <div>
                <div className={styles.spinner} />
                Cargando presupuesto de {formatMonth(month)}…
              </div>
              {slowLoading ? (
                <p role="status">La consulta está tardando más de 15 segundos. Los datos bancarios no se están modificando; podrás reintentar si no responde.</p>
              ) : null}
            </div>
          </section>
        ) : snapshot ? (
          <>
            <section
              className={styles.notice}
              aria-label="Cobertura de los datos del presupuesto"
              data-budget-coverage={budgetCoverage?.state ?? "checking"}
            >
              {coverageVerified
                ? "Cobertura estimada según las fechas bancarias importadas. Consulta los movimientos para comprobar el detalle."
                : budgetCoverage?.state === "none"
                  ? "Este mes no contiene movimientos bancarios confirmados en el intervalo importado. No se interpreta como gasto cero ni como un límite cumplido."
                  : budgetCoverage?.state === "partial"
                    ? "La cobertura bancaria de este mes es parcial. Se muestran importes observados, pero no se confirma que estés dentro del límite."
                    : budgetCoverage?.state === "unknown"
                      ? "No se ha podido verificar la cobertura bancaria de este mes. Los gastos mostrados pueden ser incompletos y el estado del límite no se certifica."
                      : "Comprobando la cobertura bancaria antes de interpretar el estado de los límites."}
            </section>
            <section className={styles.summaryGrid} aria-label="Resumen del presupuesto mensual">
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="wallet" /> Referencia automática</span>
                <strong>{formatMoney(snapshot.total.automaticAmountCents)}</strong>
                <small>
                  {snapshot.total.automaticFactors?.mode === "axioma_52_weighted"
                    ? "Histórico, estacionalidad, tendencia y recurrentes conocidos"
                    : "Media reciente mientras falta profundidad histórica"}
                </small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="remaining" /> Límite elegido</span>
                <strong>{snapshot.total.manualAmountCents === null ? "Sin definir" : formatMoney(snapshot.total.manualAmountCents)}</strong>
                <small>{snapshot.total.manualAmountCents === null ? "La referencia no se presenta como recomendación financiera" : "Objetivo mensual definido por ti"}</small>
              </article>
              <article className={styles.metric}>
                <span className={styles.metricLabel}><Icon name="spent" /> Gastado</span>
                <strong>{expenseObserved ? formatMoney(snapshot.total.actualExpenseCents) : "—"}</strong>
                <small>{coverageVerified ? "Gasto elegible de" : expenseObserved ? "Gasto parcial observado en" : "Importe no confirmado para"} {formatMonth(snapshot.month)}</small>
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
                    <h2 id="budget-planning-title">De la referencia a tu objetivo</h2>
                    <p>Cada cifra cumple una función distinta: referencia automática, decisión y resultado esperado.</p>
                  </div>
                  <span className={`${styles.status} ${coverageVerified ? styles[snapshot.total.status] : ""}`}>
                    {!coverageVerified ? "Estados sin verificar" : categorySummary.total
                      ? `${categorySummary.onTrack} dentro · ${categorySummary.attention} por revisar`
                      : "Sin categorías activas"}
                  </span>
                </div>

                <div className={styles.planningSteps}>
                  <article className={styles.planningStep}>
                    <span className={styles.stepNumber}>1</span>
                    <div>
                      <span className={styles.stepLabel}>Referencia automática</span>
                      <strong>{formatMoney(planning.historicalBaselineCents)}</strong>
                      <p>El motor combina señales históricas para comparar tu gasto; no decide cuánto deberías gastar.</p>
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
                          disabled={busy || editingKey !== null}
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
                  La referencia usa el motor Axioma §52; la proyección de ahorro usa tus ingresos recientes. Ninguna modifica la fuente bancaria ni constituye asesoramiento financiero.
                </p>
              </section>
            ) : null}

            <section className={styles.mainGrid}>
              <div className={styles.panel}>
                <div className={styles.panelInner}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Límites y referencias del mes</h2>
                      <p>Tu límite elegido tiene prioridad; sin él, la referencia automática se usa para comparar.</p>
                    </div>
                    <span className={`${styles.status} ${styles[snapshot.total.status]}`}>{formatMonth(snapshot.month)}</span>
                  </div>

                  {snapshot.categories.length > 0 ? (
                    <div className={styles.categoryToolbar} role="search" aria-label="Encontrar presupuestos por categoría">
                      <label>
                        Buscar categorías
                        <input type="search" value={categorySearch} disabled={editingKey !== null}
                          onChange={(event) => setCategorySearch(event.target.value)}
                          placeholder="Nombre de la categoría" />
                      </label>
                      <label>
                        Ver categorías
                        <select value={categoryView} disabled={editingKey !== null}
                          onChange={(event) => setCategoryView(event.target.value as "all" | "attention" | "manual")}>
                          <option value="all">Todas</option>
                          <option value="attention">Requieren atención</option>
                          <option value="manual">Con límite elegido</option>
                        </select>
                      </label>
                      <span className={styles.categoryCount} aria-live="polite" aria-atomic="true">
                        {filteredCategories.length} de {snapshot.categories.length} categorías
                      </span>
                    </div>
                  ) : null}
                  <div className={styles.budgetList} data-testid="budget-category-list">
                    <BudgetCard
                      item={snapshot.total}
                      total
                      coverageVerified={coverageVerified}
                      expenseObserved={expenseObserved}
                      monthStart={snapshot.monthStart}
                      monthEnd={snapshot.monthEnd}
                      busy={busy}
                      editLocked={editingKey !== null}
                      editing={editingKey === "__total__"}
                      editValue={editValue}
                      fieldError={editingKey === "__total__" ? fieldError : ""}
                      onStartEdit={() => startEdit(snapshot.total)}
                      onChangeEdit={changeEditValue}
                      onCancelEdit={cancelEdit}
                      onSave={() => saveManual(snapshot.total)}
                      onClearManual={() => clearManual(snapshot.total)}
                    />

                    {filteredCategories.map((item) => (
                      <BudgetCard
                        key={item.categoryId ?? item.id ?? item.categoryName ?? "category"}
                        item={item}
                        coverageVerified={coverageVerified}
                        expenseObserved={expenseObserved}
                        monthStart={snapshot.monthStart}
                        monthEnd={snapshot.monthEnd}
                        busy={busy}
                        editLocked={editingKey !== null}
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

                    {snapshot.categories.length > 0 && filteredCategories.length === 0 ? (
                      <div className={styles.emptyState} role="status">
                        <strong>No hay categorías con estos filtros</strong>
                        <p>Prueba con otra búsqueda o vuelve a mostrar todas las categorías.</p>
                        <button className={styles.secondaryButton} type="button"
                          onClick={() => { setCategorySearch(""); setCategoryView("all"); }} disabled={editingKey !== null}>Quitar filtros</button>
                      </div>
                    ) : null}
                    {snapshot.categories.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span className={styles.cardIcon} style={{ margin: "0 auto" }}><Icon name="category" /></span>
                        <strong>No hay categorías de gasto activas</strong>
                        <p>
                          El total ya muestra referencia automática, límite elegido y consumo real. Cuando existan categorías de gasto activas, aparecerán aquí con la misma separación.
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

                  <div className={styles.history} role="region" aria-label="Tres meses recientes visibles de la referencia automática">
                    {snapshot.total.historyMonths.map((row) => {
                      const maximum = Math.max(1, ...snapshot.total.historyMonths.map((entry) => entry.expenseCents));
                      return (
                        <div className={styles.historyRow} key={row.month}>
                          <span>{shortMonth(row.month)}</span>
                          <div className={styles.historyBar}><i data-budget-history-bar="true" data-zero={row.expenseCents === 0 ? "true" : undefined} style={{ width: `${row.expenseCents === 0 ? 0 : Math.max(3, (row.expenseCents / maximum) * 100)}%` }} /></div>
                          <strong>{formatMoney(row.expenseCents)}</strong>
                        </div>
                      );
                    })}
                  </div>

                  <p className={styles.explanation}>{snapshot.total.automaticExplanation}</p>

                  <div className={styles.principles}>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>La fuente bancaria se mantiene estrictamente en solo lectura.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>El gasto se calcula con los mismos movimientos efectivos que utiliza el resto de Financial App.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>El motor pondera recencia, estacionalidad, tendencia, extraordinarios y recurrentes conocidos cuando hay histórico suficiente.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las transferencias internas no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Los duplicados confirmados y las exclusiones manuales no consumen presupuesto.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Un límite elegido tiene prioridad sin borrar la referencia automática.</span></div>
                    <div className={styles.principle}><span className={styles.check}>✓</span><span>Las categorías padre incluyen sus subcategorías para evitar contar el mismo gasto dos veces.</span></div>
                  </div>
                </div>
              </aside>
            </section>
          </>
        ) : error ? (
          <section className={styles.panel} aria-labelledby="budget-load-error-title">
            <div className={styles.emptyState}>
              <span className={styles.cardIcon}><Icon name="warning" /></span>
              <h2 id="budget-load-error-title">No se ha podido cargar {formatMonth(month)}</h2>
              <p>Los datos bancarios siguen intactos. Puedes volver a intentar el cálculo sin duplicar ni modificar movimientos.</p>
              <button
                className={styles.actionButton}
                type="button"
                onClick={() => void fetchSnapshot(month)}
              >
                Reintentar
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
