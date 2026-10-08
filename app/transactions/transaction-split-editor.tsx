"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoneyCents } from "../../src/core/money";
import { formatSplitAmountInput as formatInputAmount, parseSplitAmountInput as parseInputAmount } from "../../src/application/transactions/split-amount-format";
import styles from "./transaction-split-editor.module.css";

export type TransactionSplitSummary = {
  exists: boolean;
  active: boolean;
  stale: boolean;
  canSplit: boolean;
  bankAmountCents: number;
  sourceAmountCents: number | null;
  personalAmountCents: number;
  otherAmountCents: number;
  allocationCount: number;
  categoryCount: number;
};

type SplitAllocation = {
  id: string;
  position: number;
  scope: "personal" | "other";
  amountCents: number;
  categoryId: string | null;
  effectiveCategoryId: string | null;
  categoryName: string | null;
  inheritsCategory: boolean;
  label: string | null;
};

type SplitDetail = TransactionSplitSummary & {
  effectiveKind: string;
  baseCategoryId: string | null;
  allocations: SplitAllocation[];
};

type Category = {
  id: string;
  name: string;
  kind: string;
  lifecycle: "active" | "archived";
  parent_category_id: string | null;
  sort_order: number;
};

type EditorLine = {
  key: string;
  scope: "personal" | "other";
  amount: string;
  categoryId: string;
  label: string;
};

type Props = {
  transaction: {
    id: string;
    amountCents: number;
    concept: string;
    split: TransactionSplitSummary;
  };
  categories: Category[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: (snapshot: TransactionSplitSummary) => void | Promise<void>;
  onCancel: () => void;
};

function errorMessage(payload: any) {
  const code = String(payload?.code ?? payload?.error ?? "");
  if (code.includes("preview_production_write_forbidden")) return "La vista previa es de solo lectura. El reparto se podrá guardar en producción tras publicar esta versión.";
  if (code.includes("amount_mismatch")) return "La suma del reparto debe coincidir exactamente con el importe bancario.";
  if (code.includes("sign_mismatch")) return "Todos los importes del reparto deben tener el mismo signo que el movimiento bancario.";
  if (code.includes("transfer_forbidden")) return "Las transferencias internas no se pueden repartir.";
  if (code.includes("category_not_found")) return "Una de las categorías ya no está disponible.";
  if (code.includes("transaction_not_found")) return "El movimiento ya no está disponible. Actualiza el listado.";
  return "No se pudo guardar el reparto.";
}

export function TransactionSplitEditor({
  transaction,
  categories,
  disabled,
  onBusyChange,
  onSaved,
  onCancel,
}: Props) {
  const [detail, setDetail] = useState<SplitDetail | null>(null);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lineSequence = useRef(0);

  const nextKey = () => `split-line-${transaction.id}-${++lineSequence.current}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ mode: "split", transactionId: transaction.id });
        const response = await fetch(`/api/transactions?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload));
        const loaded = payload as SplitDetail;
        setDetail(loaded);
        if (Array.isArray(loaded.allocations) && loaded.allocations.length >= 2) {
          setLines(loaded.allocations.map((allocation) => ({
            key: nextKey(),
            scope: allocation.scope,
            amount: formatInputAmount(allocation.amountCents),
            categoryId: allocation.categoryId ?? "",
            label: allocation.label ?? "",
          })));
        } else {
          setLines([
            {
              key: nextKey(),
              scope: "personal",
              amount: formatInputAmount(loaded.bankAmountCents),
              categoryId: "",
              label: "Parte personal",
            },
            {
              key: nextKey(),
              scope: "other",
              amount: "",
              categoryId: "",
              label: "Otra persona",
            },
          ]);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "No se pudo cargar el reparto.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [transaction.id]);

  const bankAbs = Math.abs(detail?.bankAmountCents ?? transaction.amountCents);
  const parsed = lines.map((line) => parseInputAmount(line.amount));
  const totalAbs = parsed.reduce<number>((sum, cents) => sum + (cents ?? 0), 0);
  const personalAbs = lines.reduce<number>((sum, line, index) => sum + (line.scope === "personal" ? (parsed[index] ?? 0) : 0), 0);
  const otherAbs = totalAbs - personalAbs;
  const difference = bankAbs - totalAbs;
  const linesValid = lines.length >= 2 && lines.length <= 20 && parsed.every((value) => value !== null);
  const canSave = Boolean(detail?.canSplit) && linesValid && difference === 0 && !saving && !disabled;

  const eligibleCategories = useMemo(() => {
    const kind = detail?.effectiveKind;
    return categories
      .filter((category) => category.lifecycle === "active")
      .filter((category) => {
        if (kind === "expense") return category.kind === "expense";
        if (kind === "income") return category.kind === "income";
        if (kind === "refund" || kind === "adjustment") return category.kind === "expense" || category.kind === "income";
        return category.kind !== "transfer";
      })
      .sort((a, b) => {
        const aParent = a.parent_category_id ? categories.find((candidate) => candidate.id === a.parent_category_id)?.name ?? "" : a.name;
        const bParent = b.parent_category_id ? categories.find((candidate) => candidate.id === b.parent_category_id)?.name ?? "" : b.name;
        return aParent.localeCompare(bParent, "es") || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es");
      });
  }, [categories, detail?.effectiveKind]);

  function categoryLabel(category: Category) {
    if (!category.parent_category_id) return category.name;
    const parent = categories.find((candidate) => candidate.id === category.parent_category_id);
    return parent ? `${parent.name} › ${category.name}` : category.name;
  }

  function updateLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
    setError(null);
  }

  function addLine() {
    if (lines.length >= 20) return;
    setLines((current) => [...current, {
      key: nextKey(),
      scope: "personal",
      amount: "",
      categoryId: "",
      label: "",
    }]);
  }

  function removeLine(key: string) {
    if (lines.length <= 2) return;
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function persist(allocations: Array<Record<string, unknown>>) {
    setSaving(true);
    onBusyChange(true);
    setError(null);
    try {
      const response = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, allocations }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload));
      const snapshot = payload?.result as TransactionSplitSummary | undefined;
      if (!snapshot) throw new Error("No se recibió la confirmación del reparto.");
      await onSaved(snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el reparto.");
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  async function save() {
    if (!detail || !canSave) return;
    const sign = detail.bankAmountCents < 0 ? -1 : 1;
    await persist(lines.map((line, index) => ({
      amountCents: sign * (parsed[index] ?? 0),
      scope: line.scope,
      categoryId: line.categoryId || null,
      label: line.label.trim() || null,
    })));
  }

  async function clear() {
    if (!detail?.exists || saving || disabled) return;
    await persist([]);
  }

  if (loading) {
    return <section className={styles.panel} aria-label="Cargando reparto"><div className={styles.loading}>Leyendo reparto…</div></section>;
  }

  return (
    <section className={styles.panel} aria-label={`Repartir ${transaction.concept}`}>
      <header className={styles.heading}>
        <div>
          <strong>Repartir movimiento</strong>
          <p>El banco conserva {formatMoneyCents(detail?.bankAmountCents ?? transaction.amountCents)}. Aquí decides qué parte es realmente tuya y cómo se reparte por categorías.</p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={saving}>Cerrar</button>
      </header>

      {detail?.stale ? (
        <div className={styles.warning} role="status">
          El banco ha revisado este movimiento desde que se creó el reparto
          {detail.sourceAmountCents !== null ? ` (${formatMoneyCents(detail.sourceAmountCents)} → ${formatMoneyCents(detail.bankAmountCents)})` : ""}.
          Revisa los importes antes de volver a activarlo.
        </div>
      ) : null}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <div className={styles.summary}>
        <div><span>Banco</span><strong>{formatMoneyCents(detail?.bankAmountCents ?? transaction.amountCents)}</strong></div>
        <div><span>Parte personal</span><strong>{formatMoneyCents((detail?.bankAmountCents ?? transaction.amountCents) < 0 ? -personalAbs : personalAbs)}</strong></div>
        <div><span>Otras personas</span><strong>{formatMoneyCents((detail?.bankAmountCents ?? transaction.amountCents) < 0 ? -otherAbs : otherAbs)}</strong></div>
        <div className={difference === 0 ? styles.balanced : styles.unbalanced}>
          <span>{difference === 0 ? "Cuadra" : difference > 0 ? "Falta repartir" : "Sobra"}</span>
          <strong>{formatMoneyCents(Math.abs(difference))}</strong>
        </div>
      </div>

      <div className={styles.lines}>
        {lines.map((line, index) => (
          <div className={styles.line} key={line.key}>
            <div className={styles.lineIndex}>{index + 1}</div>
            <label>
              <span>Importe</span>
              <div className={styles.moneyInput}><input
                data-testid={`split-amount-${index}`}
                type="text"
                inputMode="decimal"
                value={line.amount}
                placeholder="0,00"
                onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                disabled={saving || disabled}
              /><span>€</span></div>
            </label>
            <label>
              <span>Quién lo paga</span>
              <select value={line.scope} onChange={(event) => updateLine(line.key, { scope: event.target.value as EditorLine["scope"] })} disabled={saving || disabled}>
                <option value="personal">Personal</option>
                <option value="other">Otra persona</option>
              </select>
            </label>
            <label className={styles.categoryField}>
              <span>Categoría</span>
              <select value={line.categoryId} onChange={(event) => updateLine(line.key, { categoryId: event.target.value })} disabled={saving || disabled}>
                <option value="">Heredar categoría del movimiento</option>
                {eligibleCategories.map((category) => <option key={category.id} value={category.id}>{categoryLabel(category)}</option>)}
              </select>
            </label>
            <label className={styles.labelField}>
              <span>Etiqueta</span>
              <input value={line.label} maxLength={80} placeholder={line.scope === "other" ? "Ej. Rafa" : "Ej. Alimentación"} onChange={(event) => updateLine(line.key, { label: event.target.value })} disabled={saving || disabled} />
            </label>
            <button className={styles.removeButton} type="button" aria-label={`Eliminar parte ${index + 1}`} onClick={() => removeLine(line.key)} disabled={saving || disabled || lines.length <= 2}>×</button>
          </div>
        ))}
      </div>

      <div className={styles.help}>
        Las categorías solo alimentan tu analítica cuando la línea es <strong>Personal</strong>. Las partes de otras personas quedan registradas, pero no cuentan como gasto o ingreso personal.
      </div>

      <footer className={styles.actions}>
        <button className={styles.secondaryButton} type="button" onClick={addLine} disabled={saving || disabled || lines.length >= 20}>Añadir parte</button>
        <div className={styles.actionGroup}>
          {detail?.exists ? <button className={styles.dangerButton} type="button" onClick={() => void clear()} disabled={saving || disabled}>Eliminar reparto</button> : null}
          <button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button data-testid="save-split" className={styles.primaryButton} type="button" onClick={() => void save()} disabled={!canSave}>
            {saving ? "Guardando…" : "Guardar reparto"}
          </button>
        </div>
      </footer>
    </section>
  );
}
