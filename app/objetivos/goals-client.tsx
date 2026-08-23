"use client";

import { formatEuro, formatPercent } from "@/lib/format/es-es";

import { useMemo,useState } from "react";
import type { FinancialGoal,GoalPriority,GoalProgressMode,GoalStatus,GoalType,GoalsOverview } from "@/lib/financial/goals";


const dateFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"});
const typeLabel:Record<GoalType,string>={savings:"Ahorro",purchase:"Compra",emergency:"Fondo de emergencia",custom:"Otro"};
const priorityLabel:Record<GoalPriority,string>={high:"Alta",medium:"Media",low:"Baja"};
const statusLabel:Record<GoalStatus,string>={on_track:"En plazo",attention:"Exige atención",overdue:"Fecha superada",achieved:"Conseguido",flexible:"Sin fecha límite",source_missing:"Falta saldo real"};

type Editor={id?:string;name:string;type:GoalType;targetAmount:string;progressMode:GoalProgressMode;manualAmount:string;accountId:string;targetDate:string;priority:GoalPriority;notes:string};
const emptyEditor:Editor={name:"",type:"savings",targetAmount:"",progressMode:"manual",manualAmount:"0",accountId:"",targetDate:"",priority:"medium",notes:""};
const parseMoney=(value:string)=>Number(value.replace(/\s/g,"").replace(",","."));
const displayDate=(value:string|null)=>value?dateFormat.format(new Date(`${value}T12:00:00`)):"Sin fecha límite";

export function GoalsClient({initialData}:{initialData:GoalsOverview}){
  const [data,setData]=useState(initialData);const [editor,setEditor]=useState<Editor|null>(null);const [loading,setLoading]=useState(false);const [feedback,setFeedback]=useState<string|null>(null);
  const capacityPositive=Math.max(0,data.capacityReference);
  const knownProgress=data.summary.targetTotal>0?Math.min(100,Math.max(0,data.summary.trackedTotal/data.summary.targetTotal*100)):0;
  const selectedAccount=useMemo(()=>editor?.accountId?data.accounts.find(a=>a.id===editor.accountId)||null:null,[data.accounts,editor?.accountId]);

  async function reload(){
    const r=await fetch("/api/goals",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se han podido actualizar los objetivos");setData(j);
  }
  function openEdit(goal:FinancialGoal){setEditor({id:goal.id,name:goal.name,type:goal.type,targetAmount:goal.targetAmount.toFixed(2).replace(".",","),progressMode:goal.progressMode,manualAmount:goal.manualAmount.toFixed(2).replace(".",","),accountId:goal.accountId||"",targetDate:goal.targetDate||"",priority:goal.priority,notes:goal.notes||""});setFeedback(null);}
  async function saveGoal(){
    if(!editor)return;const targetAmount=parseMoney(editor.targetAmount);const manualAmount=parseMoney(editor.manualAmount||"0");
    if(!editor.name.trim()||!Number.isFinite(targetAmount)||targetAmount<=0){setFeedback("Indica un nombre y un importe objetivo válido.");return;}
    if(editor.progressMode==="manual"&&(!Number.isFinite(manualAmount)||manualAmount<0)){setFeedback("El progreso manual debe ser un importe válido.");return;}
    if(editor.progressMode==="account"&&!editor.accountId){setFeedback("Selecciona la cuenta que medirá el progreso.");return;}
    setLoading(true);setFeedback(null);
    try{
      const r=await fetch("/api/goals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...editor,targetAmount,manualAmount:editor.progressMode==="manual"?manualAmount:0,accountId:editor.progressMode==="account"?editor.accountId:null,targetDate:editor.targetDate||null})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido guardar el objetivo");setEditor(null);await reload();setFeedback("Objetivo guardado.");
    }catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido guardar el objetivo");}finally{setLoading(false);}
  }
  async function removeGoal(id:string){
    if(!window.confirm("¿Archivar este objetivo? No se modifica ningún movimiento ni saldo bancario."))return;
    setLoading(true);setFeedback(null);try{const r=await fetch(`/api/goals?id=${encodeURIComponent(id)}`,{method:"DELETE"});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se ha podido archivar");setEditor(null);await reload();setFeedback("Objetivo archivado.");}catch(e){setFeedback(e instanceof Error?e.message:"No se ha podido archivar");}finally{setLoading(false);}
  }

  return <div className={`goals-module ${loading?"is-loading":""}`}>
    <div className="goals-toolbar"><div><strong>{data.summary.activeCount} objetivos activos</strong><span>Actualizado con datos reales a {displayDate(data.asOf)}</span></div><button className="primary-action" type="button" onClick={()=>setEditor({...emptyEditor})}>+ Nuevo objetivo</button></div>
    {feedback&&<div className="goals-feedback" role="status">{feedback}</div>}

    <section className="goals-summary" aria-label="Resumen de objetivos">
      <article><span>Objetivo total</span><strong>{data.summary.activeCount?formatEuro(data.summary.targetTotal):"—"}</strong><small>{data.summary.activeCount?`${${formatPercent(knownProgress,1)} registrado`:"Crea tu primera meta"}</small></article>
      <article><span>Progreso conocido</span><strong>{data.summary.activeCount?formatEuro(data.summary.trackedTotal):"—"}</strong><small>Solo importes manuales o saldos reales</small></article>
      <article><span>Por completar</span><strong>{data.summary.activeCount?formatEuro(data.summary.remainingTotal):"—"}</strong><small>{data.summary.achievedCount} conseguidos</small></article>
      <article className={data.summary.attentionCount||data.summary.overdueCount?"warning":"good"}><span>Aportación mensual</span><strong>{data.summary.monthlyRequired>0?formatEuro(data.summary.monthlyRequired):"—"}</strong><small>{data.summary.attentionCount} en atención · {data.summary.overdueCount} vencidos</small></article>
      <article><span>Capacidad de referencia</span><strong>{formatEuro(data.capacityReference)}</strong><small>Media de cash flow neto de 3 meses cerrados</small></article>
    </section>

    <section className="goals-panel"><div className="goals-panel-head"><div><p className="eyebrow">PLAN PERSONAL</p><h2>Metas y progreso</h2></div><span className="pill">{data.summary.sourceMissingCount?`${data.summary.sourceMissingCount} sin saldo real`:"Fuentes verificadas"}</span></div>
      {!data.goals.length?<div className="goals-empty"><strong>Todavía no hay objetivos financieros.</strong><p>Crea una meta con progreso manual o vincúlala al saldo real de una cuenta. La aplicación no asignará dinero ni supondrá aportaciones por ti.</p><button className="primary-action" type="button" onClick={()=>setEditor({...emptyEditor})}>Crear primer objetivo</button></div>:
      <div className="goals-list">{data.goals.map(goal=>{
        const percent=goal.progressPercent==null?0:Math.min(100,Math.max(0,goal.progressPercent));
        return <article className={`goal-card status-${goal.status}`} key={goal.id}>
          <div className="goal-card-head"><div><div className="goal-meta"><span>{typeLabel[goal.type]}</span><span>Prioridad {priorityLabel[goal.priority].toLowerCase()}</span></div><h3>{goal.name}</h3></div><div className="goal-actions"><span className={`goal-status ${goal.status}`}>{statusLabel[goal.status]}</span><button className="text-button" type="button" onClick={()=>openEdit(goal)}>Editar</button></div></div>
          <div className="goal-amounts"><div><span>Progreso</span><strong>{goal.progressAmount==null?"—":formatEuro(goal.progressAmount)}</strong></div><div><span>Objetivo</span><strong>{formatEuro(goal.targetAmount)}</strong></div><div><span>Falta</span><strong>{goal.remainingAmount==null?"—":formatEuro(goal.remainingAmount)}</strong></div><div><span>Al mes</span><strong>{goal.monthlyRequired==null?"—":formatEuro(goal.monthlyRequired)}</strong></div></div>
          <div className="goal-progress" aria-label={`Progreso ${goal.progressPercent??0}%`}><span style={{width:`${percent}%`}}/></div>
          <div className="goal-card-foot"><span>{goal.progressMode==="account"?`Saldo real · ${goal.accountName||"Cuenta no disponible"}`:"Progreso manual"}</span><span>{goal.progressMode==="account"&&goal.balanceDate?`Saldo ${displayDate(goal.balanceDate)}`:goal.progressMode==="account"?"Sin fecha de saldo":"Editable y trazable"}</span><span>{displayDate(goal.targetDate)}</span>{goal.monthsRemaining!=null&&goal.status!=="achieved"&&<span>{goal.monthsRemaining} meses estimados</span>}</div>
          {goal.progressMode==="account"&&goal.currentAmount!=null&&goal.currentAmount<0&&<p className="goal-source-note">El saldo real es {formatEuro(goal.currentAmount)}. Para el porcentaje de progreso se usa 0 €, sin ocultar el saldo negativo.</p>}
        </article>})}</div>}
    </section>

    <aside className="goals-rule-note"><strong>Cómo se calcula</strong><p>La aportación mensual necesaria divide lo que falta entre los meses hasta la fecha objetivo. “Exige atención” compara ese ritmo con la media de cash flow neto de los tres últimos meses cerrados: es una referencia, no una promesa de ahorro. Los objetivos sin fecha no reciben una aportación ficticia.</p>{capacityPositive===0&&data.summary.monthlyRequired>0&&<p>La capacidad reciente no es positiva, por lo que cualquier objetivo con aportación pendiente y fecha puede requerir atención.</p>}</aside>

    {editor&&<div className="goals-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null)}}><section className="goals-modal" role="dialog" aria-modal="true" aria-labelledby="goal-editor-title">
      <div className="goals-modal-head"><div><p className="eyebrow">{editor.id?"EDITAR META":"NUEVA META"}</p><h2 id="goal-editor-title">Objetivo financiero</h2></div><button className="icon-button" type="button" onClick={()=>setEditor(null)} aria-label="Cerrar">×</button></div>
      <div className="goals-form">
        <label>Nombre<input value={editor.name} maxLength={120} onChange={e=>setEditor({...editor,name:e.target.value})} placeholder="Ej. Fondo de emergencia"/></label>
        <div className="goals-form-grid"><label>Tipo<select value={editor.type} onChange={e=>setEditor({...editor,type:e.target.value as GoalType})}><option value="savings">Ahorro</option><option value="purchase">Compra</option><option value="emergency">Fondo de emergencia</option><option value="custom">Otro</option></select></label><label>Prioridad<select value={editor.priority} onChange={e=>setEditor({...editor,priority:e.target.value as GoalPriority})}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label></div>
        <div className="goals-form-grid"><label>Importe objetivo (€)<input inputMode="decimal" value={editor.targetAmount} onChange={e=>setEditor({...editor,targetAmount:e.target.value})} placeholder="0,00"/></label><label>Fecha objetivo <small>Opcional</small><input type="date" value={editor.targetDate} onChange={e=>setEditor({...editor,targetDate:e.target.value})}/></label></div>
        <fieldset><legend>Origen del progreso</legend><div className="goal-mode-options"><label><input type="radio" name="progress-mode" checked={editor.progressMode==="manual"} onChange={()=>setEditor({...editor,progressMode:"manual",accountId:""})}/><span><strong>Manual</strong><small>Tú indicas cuánto llevas reservado.</small></span></label><label><input type="radio" name="progress-mode" checked={editor.progressMode==="account"} onChange={()=>setEditor({...editor,progressMode:"account"})}/><span><strong>Saldo de una cuenta</strong><small>Usa el último saldo bancario real disponible.</small></span></label></div></fieldset>
        {editor.progressMode==="manual"?<label>Importe ya reservado (€)<input inputMode="decimal" value={editor.manualAmount} onChange={e=>setEditor({...editor,manualAmount:e.target.value})} placeholder="0,00"/><small>Este importe es un dato introducido por ti, no un saldo bancario.</small></label>:<label>Cuenta vinculada<select value={editor.accountId} onChange={e=>setEditor({...editor,accountId:e.target.value})}><option value="">Selecciona una cuenta</option>{data.accounts.map(a=><option value={a.id} key={a.id}>{a.name}{a.balance==null?" · sin saldo":` · ${formatEuro(a.balance)}`}</option>)}</select>{selectedAccount&&<small>{selectedAccount.balance==null?"Esta cuenta no tiene un saldo real disponible; el objetivo quedará marcado para revisión.":`Último saldo: ${formatEuro(selectedAccount.balance)}${selectedAccount.balanceDate?` · ${displayDate(selectedAccount.balanceDate)}`:""}`}</small>}</label>}
        <label>Notas<textarea rows={3} value={editor.notes} onChange={e=>setEditor({...editor,notes:e.target.value})} placeholder="Opcional"/></label>
      </div>
      <div className="goals-modal-actions">{editor.id?<button className="danger-button" type="button" onClick={()=>removeGoal(editor.id!)} disabled={loading}>Archivar</button>:<div/>}<div/><button className="ghost" type="button" onClick={()=>setEditor(null)}>Cancelar</button><button className="primary-action" type="button" onClick={saveGoal} disabled={loading}>{loading?"Guardando…":"Guardar"}</button></div>
    </section></div>}
  </div>;
}
