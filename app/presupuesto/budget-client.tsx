"use client";

import { useMemo, useState } from "react";
import type { BudgetItem, BudgetMonth, UnbudgetedItem } from "@/lib/financial/budget";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });

function moveMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(month: string) {
  return monthName.format(new Date(`${month}-01T12:00:00`));
}

type Editor = {
  id?: string;
  category: string;
  subcategory: string;
  amount: string;
  carryover: boolean;
  notes: string;
};

const emptyEditor: Editor = { category: "", subcategory: "", amount: "", carryover: false, notes: "" };

export function BudgetClient({ initialData }: { initialData: BudgetMonth }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const totalSpent = data.spent + data.unbudgetedSpent;
  const coverage = totalSpent > 0 ? Math.round((data.spent / totalSpent) * 100) : 100;
  const monthLabel = useMemo(() => labelMonth(data.month), [data.month]);

  async function loadMonth(month: string) {
    setLoading(true); setFeedback(null);
    try {
      const response = await fetch(`/api/budget?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se ha podido cargar el presupuesto");
      setData(json);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Error al cargar el presupuesto"); }
    finally { setLoading(false); }
  }

  function openEdit(item: BudgetItem) {
    setEditor({ id: item.id, category: item.category, subcategory: item.subcategory || "", amount: String(item.assigned).replace(".", ","), carryover: item.carryover, notes: item.notes || "" });
    setFeedback(null);
  }

  function openFromUnbudgeted(item: UnbudgetedItem) {
    const amount = item.suggestion > 0 ? item.suggestion : item.spent;
    setEditor({ category: item.category, subcategory: item.subcategory || "", amount: amount.toFixed(2).replace(".", ","), carryover: false, notes: "" });
    setFeedback(null);
  }

  async function saveBudget() {
    if (!editor) return;
    const amount = Number(editor.amount.replace(",", "."));
    if (!editor.category.trim() || !Number.isFinite(amount) || amount < 0) { setFeedback("Indica una categoría y un importe válido."); return; }
    setLoading(true); setFeedback(null);
    try {
      const response = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editor, amount, month: data.month }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.includes("already_exists") ? "Ya existe un presupuesto para esa categoría y subcategoría en este mes." : json.error || "No se ha podido guardar");
      setEditor(null);
      await loadMonth(data.month);
      setFeedback("Presupuesto guardado.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "No se ha podido guardar"); setLoading(false); }
  }

  async function removeBudget(id: string) {
    if (!window.confirm("¿Quitar este presupuesto del mes? Los movimientos no se modifican.")) return;
    setLoading(true); setFeedback(null);
    try {
      const response = await fetch(`/api/budget?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se ha podido quitar");
      setEditor(null);
      await loadMonth(data.month);
      setFeedback("Presupuesto retirado del mes.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "No se ha podido quitar"); setLoading(false); }
  }

  return <div className={`budget-module ${loading ? "is-loading" : ""}`}>
    <div className="budget-toolbar">
      <div className="month-switcher">
        <button className="ghost" onClick={() => loadMonth(moveMonth(data.month, -1))} disabled={loading} aria-label="Mes anterior">←</button>
        <div><span>Presupuesto mensual</span><strong>{monthLabel}</strong></div>
        <button className="ghost" onClick={() => loadMonth(moveMonth(data.month, 1))} disabled={loading} aria-label="Mes siguiente">→</button>
      </div>
      <button className="primary-action" onClick={() => setEditor({ ...emptyEditor })}>+ Añadir presupuesto</button>
    </div>

    {feedback && <div className="budget-feedback" role="status">{feedback}</div>}

    <section className="budget-summary" aria-label="Resumen del presupuesto">
      <article><span>Asignado</span><strong>{money.format(data.assigned)}</strong><small>{data.budgets.length} partidas presupuestadas</small></article>
      <article><span>Gastado con presupuesto</span><strong>{money.format(data.spent)}</strong><small>{coverage}% del gasto mensual cubierto</small></article>
      <article className={data.available < 0 ? "danger" : "good"}><span>Disponible</span><strong>{money.format(data.available)}</strong><small>{data.overBudgetCount ? `${data.overBudgetCount} partidas excedidas` : "Sin excesos en partidas activas"}</small></article>
      <article className={data.unbudgetedSpent > 0 ? "warning" : "good"}><span>Sin presupuesto</span><strong>{money.format(data.unbudgetedSpent)}</strong><small>{data.unbudgeted.length} partidas con gasto real</small></article>
    </section>

    <div className="budget-layout">
      <section className="budget-panel">
        <div className="budget-panel-head"><div><p className="eyebrow">PLAN DEL MES</p><h2>Partidas presupuestadas</h2></div><span className="pill">Gasto total {money.format(totalSpent)}</span></div>
        {!data.budgets.length ? <div className="budget-empty"><strong>Aún no has asignado límites para {monthLabel}.</strong><p>Los gastos reales ya están detectados. Puedes convertir cualquiera de las partidas de la derecha en presupuesto con un clic.</p></div> : <div className="budget-list">
          {data.budgets.map(item => {
            const denom = item.assigned + item.carryIn;
            const percent = denom > 0 ? Math.min(100, Math.max(0, (item.spent / denom) * 100)) : item.spent > 0 ? 100 : 0;
            return <article key={item.id} className={`budget-row ${item.available < 0 ? "over" : ""}`}>
              <div className="budget-row-main">
                <div><strong>{item.category}</strong><span>{item.subcategory || "Toda la categoría"}{item.carryover ? ` · arrastre ${money.format(item.carryIn)}` : ""}</span></div>
                <button className="text-button" onClick={() => openEdit(item)}>Editar</button>
              </div>
              <div className="budget-values"><div><span>Asignado</span><strong>{money.format(item.assigned)}</strong></div><div><span>Gastado</span><strong>{money.format(item.spent)}</strong></div><div><span>Disponible</span><strong className={item.available < 0 ? "negative" : "positive"}>{money.format(item.available)}</strong></div></div>
              <div className="budget-progress"><span style={{ width: `${percent}%` }} /></div>
              <div className="budget-row-foot"><span>{item.movements} movimientos</span><span>Media 3 meses: {money.format(item.suggestion)}</span><span>{item.percent.toLocaleString("es-ES", { maximumFractionDigits: 1 })}% consumido</span></div>
            </article>;
          })}
        </div>}
      </section>

      <aside className="budget-panel unbudgeted-panel">
        <div className="budget-panel-head"><div><p className="eyebrow">POR CONTROLAR</p><h2>Gasto sin presupuesto</h2></div><span className="pill">{money.format(data.unbudgetedSpent)}</span></div>
        {!data.unbudgeted.length ? <div className="budget-empty compact"><strong>Todo el gasto del mes está cubierto.</strong></div> : <div className="unbudgeted-list">{data.unbudgeted.map((item,index) => <div className="unbudgeted-row" key={`${item.category}-${item.subcategory || "all"}-${index}`}>
          <div><strong>{item.category}</strong><span>{item.subcategory || "Sin subcategoría"} · {item.movements} mov.</span><small>Media 3 meses {money.format(item.suggestion)}</small></div>
          <div><b>{money.format(item.spent)}</b><button className="text-button" onClick={() => openFromUnbudgeted(item)}>Presupuestar</button></div>
        </div>)}</div>}
      </aside>
    </div>

    <aside className="budget-rule-note"><strong>Cómo se calcula</strong><p>El presupuesto usa gastos reales de cuentas operativas. Cuenta de ahorro, traspasos internos, duplicados y movimientos desaparecidos del origen no consumen presupuesto. Un límite de categoría incluye todas sus subcategorías; puedes crear límites más específicos si lo necesitas.</p></aside>

    {editor && <div className="budget-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null); }}>
      <section className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title">
        <div className="budget-modal-head"><div><p className="eyebrow">{editor.id ? "EDITAR" : "NUEVA PARTIDA"}</p><h2 id="budget-editor-title">Presupuesto de {monthLabel}</h2></div><button className="icon-button" onClick={() => setEditor(null)} aria-label="Cerrar">×</button></div>
        <div className="budget-form">
          <label>Categoría<select value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })}><option value="">Selecciona una categoría</option>{data.categories.map(category => <option value={category} key={category}>{category}</option>)}</select></label>
          <label>Subcategoría <small>Opcional; vacío = toda la categoría</small><input value={editor.subcategory} onChange={e => setEditor({ ...editor, subcategory: e.target.value })} placeholder="Ej. Combustible" /></label>
          <label>Importe asignado (€)<input inputMode="decimal" value={editor.amount} onChange={e => setEditor({ ...editor, amount: e.target.value })} placeholder="0,00" /></label>
          <label className="carryover-control"><input type="checkbox" checked={editor.carryover} onChange={e => setEditor({ ...editor, carryover: e.target.checked })} /><span>Arrastrar al mes siguiente el disponible positivo</span></label>
          <label>Notas<textarea rows={3} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} placeholder="Opcional" /></label>
        </div>
        <div className="budget-modal-actions">{editor.id && <button className="danger-button" onClick={() => removeBudget(editor.id!)} disabled={loading}>Quitar</button>}<div /><button className="ghost" onClick={() => setEditor(null)}>Cancelar</button><button className="primary-action" onClick={saveBudget} disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button></div>
      </section>
    </div>}
  </div>;
}
