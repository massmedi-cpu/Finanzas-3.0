"use client";

import { formatEuro } from "@/lib/format/es-es";

import { useMemo, useState } from "react";
import type { ManualNetWorthItem, NetWorthOverview } from "@/lib/financial/net-worth";
import { NetWorthChart } from "@/components/net-worth-chart";


const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

type Editor = {
  id?: string;
  name: string;
  itemType: "asset" | "liability";
  category: string;
  value: string;
  valuationDate: string;
  includeInTotal: boolean;
  notes: string;
};
const emptyEditor = (): Editor => ({ name: "", itemType: "asset", category: "", value: "", valuationDate: today(), includeInTotal: true, notes: "" });

export function NetWorthClient({ initial }: { initial: NetWorthOverview }) {
  const [data, setData] = useState(initial);
  const [months, setMonths] = useState(18);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeManual = useMemo(() => data.manualItems.filter((item) => item.active), [data.manualItems]);
  const inactiveManual = useMemo(() => data.manualItems.filter((item) => !item.active), [data.manualItems]);
  const incomplete = data.history.filter((point) => !point.complete).length;

  async function reload(nextMonths = months) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/net-worth?months=${nextMonths}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el patrimonio");
      setData(payload);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el patrimonio"); }
    finally { setBusy(false); }
  }

  function editItem(item: ManualNetWorthItem) {
    setEditor({ id: item.id, name: item.name, itemType: item.itemType, category: item.category || "", value: String(item.value), valuationDate: item.valuationDate, includeInTotal: item.includeInTotal, notes: item.notes || "" });
  }

  async function save() {
    if (!editor) return;
    const value = Number(editor.value.replace(",", "."));
    if (!editor.name.trim() || !Number.isFinite(value) || value < 0) { setError("Indica un nombre y un valor válido."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/net-worth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editor, value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar");
      setData(payload); setEditor(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }

  async function deactivate(id: string) {
    if (!window.confirm("¿Retirar este elemento del patrimonio actual? Su historial se conservará.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/net-worth?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo retirar");
      setData(payload); if (editor?.id === id) setEditor(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo retirar"); }
    finally { setBusy(false); }
  }

  return <>
    {error && <div className="nw-error" role="alert">{error}</div>}

    <section className="nw-summary">
      <article><span>Activos</span><strong>{formatEuro(data.assets)}</strong><small>Cuentas + activos manuales incluidos</small></article>
      <article><span>Deudas</span><strong>{formatEuro(data.liabilities)}</strong><small>Pasivos manuales y saldos negativos</small></article>
      <article className="nw-total"><span>Patrimonio neto</span><strong>{formatEuro(data.netWorth)}</strong><small>{data.changeFromFirstCompletePercent >= 0 ? "+" : ""}{data.changeFromFirstCompletePercent.toFixed(2)} % desde el primer mes completo</small></article>
      <article><span>Proyección 90 días</span><strong>{formatEuro(data.projectedNetWorth90)}</strong><small>Impacto confirmado: {formatEuro(data.forecastImpact90)}</small></article>
    </section>

    <article className="panel nw-chart-panel">
      <div className="panel-head"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Patrimonio neto</h2></div><div className="nw-range"><label>Histórico<select value={months} disabled={busy} onChange={(event) => { const value = Number(event.target.value); setMonths(value); void reload(value); }}><option value={12}>12 meses</option><option value={18}>18 meses</option><option value={24}>24 meses</option><option value={36}>36 meses</option><option value={60}>60 meses</option></select></label><button className="ghost" disabled={busy} onClick={() => void reload()}>{busy ? "Actualizando…" : "Actualizar"}</button></div></div>
      <NetWorthChart points={data.history}/>
      {incomplete > 0 && <p className="nw-coverage-note">{incomplete} meses anteriores no muestran patrimonio total porque falta saldo histórico de alguna cuenta. No se han rellenado con datos inventados.</p>}
    </article>

    <div className="nw-grid">
      <article className="panel nw-items-panel">
        <div className="panel-head"><div><p className="eyebrow">COMPOSICIÓN</p><h2>Elementos patrimoniales</h2></div><button className="ghost" onClick={() => setEditor(emptyEditor())}>Añadir elemento</button></div>
        <div className="nw-group"><h3>Cuentas automáticas</h3>{data.bankItems.map((item) => <div className="nw-item" key={item.id}><div><strong>{item.name}</strong><span>{item.identifier} · {item.role === "savings" ? "Ahorro" : "Operativa"}</span></div><div className="nw-item-value"><strong>{item.balance == null ? "—" : formatEuro(item.balance)}</strong><small>{item.balanceDate ? `Saldo ${dateFmt.format(new Date(`${item.balanceDate}T12:00:00`))}` : "Sin saldo"}</small></div></div>)}</div>
        <div className="nw-group"><h3>Elementos manuales</h3>{activeManual.length === 0 ? <p className="nw-empty">No has añadido inversiones, otros activos ni deudas. Las cuentas bancarias son actualmente todo el patrimonio registrado.</p> : activeManual.map((item) => <div className={`nw-item manual ${item.includeInTotal ? "" : "excluded"}`} key={item.id}><div><strong>{item.name}</strong><span>{item.itemType === "liability" ? "Deuda" : "Activo"}{item.category ? ` · ${item.category}` : ""}{!item.includeInTotal ? " · fuera del total" : ""}</span></div><div className="nw-item-value"><strong className={item.itemType === "liability" ? "negative" : ""}>{item.itemType === "liability" ? "−" : ""}{formatEuro(item.value)}</strong><div className="nw-actions"><button onClick={() => editItem(item)}>Editar</button><button onClick={() => void deactivate(item.id)}>Retirar</button></div></div></div>)}</div>
        {inactiveManual.length > 0 && <details className="nw-archived"><summary>Elementos retirados ({inactiveManual.length})</summary>{inactiveManual.map((item) => <div className="nw-item" key={item.id}><div><strong>{item.name}</strong><span>Retirado · historial conservado</span></div><button className="ghost" onClick={() => editItem(item)}>Reactivar</button></div>)}</details>}
      </article>

      <aside className="panel nw-rules-panel"><p className="eyebrow">REGLAS</p><h2>Cómo se calcula</h2><ul><li><b>Cuentas bancarias</b><span>Saldo real de ·3967 y ·2504.</span></li><li><b>Elementos manuales</b><span>Solo los que añadas o edites expresamente.</span></li><li><b>Deudas</b><span>Restan al patrimonio por su valor pendiente.</span></li><li><b>Previsión</b><span>Solo previsiones guardadas; las sugerencias no alteran el total.</span></li></ul><p className="nw-rule-foot">Cobertura actual: {data.coverage.knownAccounts}/{data.coverage.accountCount} cuentas con saldo conocido.</p></aside>
    </div>

    {editor && <div className="nw-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}><section className="nw-editor" role="dialog" aria-modal="true" aria-labelledby="nw-editor-title"><div className="nw-editor-head"><div><p className="eyebrow">PATRIMONIO MANUAL</p><h2 id="nw-editor-title">{editor.id ? "Editar elemento" : "Añadir elemento"}</h2></div><button aria-label="Cerrar" onClick={() => setEditor(null)}>×</button></div><div className="nw-form">
      <label>Nombre<input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Ej. Fondo indexado"/></label>
      <div className="nw-form-row"><label>Tipo<select value={editor.itemType} onChange={(e) => setEditor({ ...editor, itemType: e.target.value as "asset" | "liability" })}><option value="asset">Activo</option><option value="liability">Deuda</option></select></label><label>Valor (€)<input inputMode="decimal" value={editor.value} onChange={(e) => setEditor({ ...editor, value: e.target.value })} placeholder="0,00"/></label></div>
      <div className="nw-form-row"><label>Categoría<input value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} placeholder="Inversión, vehículo…"/></label><label>Fecha de valoración<input type="date" value={editor.valuationDate} onChange={(e) => setEditor({ ...editor, valuationDate: e.target.value })}/></label></div>
      <label>Notas<textarea rows={3} value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })}/></label>
      <label className="nw-check"><input type="checkbox" checked={editor.includeInTotal} onChange={(e) => setEditor({ ...editor, includeInTotal: e.target.checked })}/><span>Incluir en el patrimonio neto</span></label>
      <div className="nw-editor-actions"><button className="ghost" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="nw-primary" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button></div>
    </div></section></div>}
  </>;
}
