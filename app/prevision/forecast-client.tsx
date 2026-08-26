"use client";

import { useMemo,useState } from "react";
import { formatEuro } from "@/lib/format/es-es";
import { madridToday } from "@/lib/time/madrid";
import type { ForecastCalendarEvent,ForecastCalendarOverview } from "@/lib/financial/forecast-calendar";

const monthFmt=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"});
const dayFmt=new Intl.DateTimeFormat("es-ES",{weekday:"short",day:"2-digit",month:"short"});
const fullDateFmt=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"long",year:"numeric"});
const weekdays=["L","M","X","J","V","S","D"];
const today=madridToday();

function monthLabel(month:string){return monthFmt.format(new Date(`${month}-15T12:00:00`));}
function dateLabel(date:string){return fullDateFmt.format(new Date(`${date}T12:00:00`));}
function addMonths(month:string,offset:number){const[y,m]=month.split("-").map(Number);return new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7);}
function daysInMonth(month:string){const[y,m]=month.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
function monthCells(month:string){
  const[y,m]=month.split("-").map(Number);
  const first=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
  const cells:(string|null)[]=Array.from({length:first},()=>null);
  for(let d=1;d<=daysInMonth(month);d++)cells.push(`${month}-${String(d).padStart(2,"0")}`);
  while(cells.length%7)cells.push(null);
  return cells;
}
function recurrenceLabel(value:ForecastCalendarEvent["frequency"]){
  if(value==="once")return"Una vez";
  if(value==="weekly")return"Semanal";
  if(value==="bimonthly")return"Bimestral";
  if(value==="quarterly")return"Trimestral";
  if(value==="yearly")return"Anual";
  return"Mensual";
}
function statusLabel(event:ForecastCalendarEvent){
  if(event.status==="received")return"Recibido";
  if(event.status==="late")return"Pendiente";
  return"Esperado";
}
function sourceLabel(event:ForecastCalendarEvent){return event.source==="manual"?"Añadido por ti":"Detectado automáticamente";}
function domId(id:string){return`forecast-${id.replace(/[^a-zA-Z0-9_-]/g,"-")}`;}
function movementHref(event:ForecastCalendarEvent){
  if(!event.actual)return"/movimientos";
  const q=new URLSearchParams({from:event.actual.date,to:event.actual.date});
  const search=(event.counterparty||event.actual.title||event.title).trim();
  if(search)q.set("search",search);
  return`/movimientos?${q.toString()}`;
}

type Editor={
  title:string;date:string;direction:"expense"|"income";amount:string;category:string;subcategory:string;
  counterparty:string;recurrence:"once"|"monthly"|"bimonthly"|"quarterly"|"yearly";until:string;notes:string;
};
function emptyEditor(month:string):Editor{
  const date=month===today.slice(0,7)?today:`${month}-01`;
  return{title:"",date,direction:"expense",amount:"",category:"",subcategory:"",counterparty:"",recurrence:"once",until:"",notes:""};
}

export function ForecastClient({initialData}:{initialData:ForecastCalendarOverview}){
  const[data,setData]=useState(initialData);
  const[selectedMonth,setSelectedMonth]=useState(today.slice(0,7));
  const[editor,setEditor]=useState<Editor|null>(null);
  const[loading,setLoading]=useState(false);
  const[feedback,setFeedback]=useState<string|null>(null);
  const[filter,setFilter]=useState<"all"|"expense"|"income">("all");

  const monthOptions=useMemo(()=>Array.from({length:data.months},(_,i)=>addMonths(data.startDate.slice(0,7),i)),[data.months,data.startDate]);
  const monthEvents=useMemo(()=>data.events
    .filter(event=>event.estimatedDate.startsWith(selectedMonth))
    .filter(event=>filter==="all"||(filter==="expense"?event.estimatedAmount<0:event.estimatedAmount>0))
    .sort((a,b)=>a.estimatedDate.localeCompare(b.estimatedDate)||Math.abs(b.estimatedAmount)-Math.abs(a.estimatedAmount)),[data.events,selectedMonth,filter]);
  const eventsByDay=useMemo(()=>{const map=new Map<string,ForecastCalendarEvent[]>();for(const event of monthEvents){const list=map.get(event.estimatedDate)||[];list.push(event);map.set(event.estimatedDate,list);}return map;},[monthEvents]);
  const cells=useMemo(()=>monthCells(selectedMonth),[selectedMonth]);
  const counts=useMemo(()=>({
    total:monthEvents.length,
    expected:monthEvents.filter(x=>x.status==="expected").length,
    received:monthEvents.filter(x=>x.status==="received").length,
    late:monthEvents.filter(x=>x.status==="late").length,
  }),[monthEvents]);

  async function load(){
    setLoading(true);setFeedback(null);
    try{
      const response=await fetch("/api/forecast?months=12",{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"No se ha podido actualizar el calendario.");
      setData(json);
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido actualizar el calendario.");}
    finally{setLoading(false);}
  }
  async function save(){
    if(!editor)return;
    const amount=Math.abs(Number(editor.amount.replace(",",".")));
    if(!editor.title.trim()||!editor.date||!Number.isFinite(amount)||amount<=0){setFeedback("Indica un nombre, una fecha y un importe válidos.");return;}
    let recurrence:any=null;
    if(editor.recurrence!=="once"){
      recurrence=editor.recurrence==="yearly"
        ?{frequency:"yearly",interval:1}
        :{frequency:"monthly",interval:editor.recurrence==="bimonthly"?2:editor.recurrence==="quarterly"?3:1};
      if(editor.until)recurrence.until=editor.until;
    }
    setLoading(true);setFeedback(null);
    try{
      const response=await fetch("/api/forecast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:editor.title.trim(),date:editor.date,amount:editor.direction==="expense"?-amount:amount,
        category:editor.category||null,subcategory:editor.subcategory||null,counterparty:editor.counterparty||null,
        recurrence,notes:editor.notes||null,confidence:1,explanation:{source:"manual_calendar"},
      })});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"No se ha podido guardar.");
      setEditor(null);await load();setFeedback("Movimiento esperado añadido al calendario.");
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido guardar.");setLoading(false);}
  }
  async function cancel(event:ForecastCalendarEvent){
    if(!event.forecastId||!window.confirm("¿Quitar esta previsión manual y sus próximas repeticiones? Los movimientos bancarios no se modifican."))return;
    setLoading(true);setFeedback(null);
    try{
      const response=await fetch(`/api/forecast?id=${encodeURIComponent(event.forecastId)}`,{method:"DELETE"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"No se ha podido quitar.");
      await load();setFeedback("Previsión manual retirada.");
    }catch(error){setFeedback(error instanceof Error?error.message:"No se ha podido quitar.");setLoading(false);}
  }
  function stepMonth(offset:number){
    const next=addMonths(selectedMonth,offset);
    if(monthOptions.includes(next))setSelectedMonth(next);
  }

  return <div className={`forecast-calendar-module ${loading?"is-loading":""}`}>
    <section className="forecast-calendar-intro">
      <div><p className="eyebrow">CALENDARIO</p><h2>Lo que debería llegar</h2><p>Las fechas son aproximadas. Seguros e impuestos se buscan también por comportamiento anual, aunque cambien de importe o no sean perfectamente regulares.</p></div>
      <div className="forecast-calendar-legend" aria-label="Estados del calendario">
        <span className="legend-expected">Esperado</span><span className="legend-received">Recibido</span><span className="legend-late">Pendiente</span>
      </div>
    </section>

    <div className="forecast-calendar-toolbar">
      <div className="forecast-month-nav">
        <button type="button" className="ghost-action" onClick={()=>stepMonth(-1)} disabled={selectedMonth===monthOptions[0]}>←</button>
        <label><span className="sr-only">Mes</span><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{monthOptions.map(month=><option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
        <button type="button" className="ghost-action" onClick={()=>stepMonth(1)} disabled={selectedMonth===monthOptions.at(-1)}>→</button>
      </div>
      <div className="forecast-type-filter" aria-label="Tipo de movimiento">
        <button type="button" className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Todos</button>
        <button type="button" className={filter==="expense"?"active":""} onClick={()=>setFilter("expense")}>Cargos</button>
        <button type="button" className={filter==="income"?"active":""} onClick={()=>setFilter("income")}>Ingresos</button>
      </div>
      <button className="primary-action" type="button" onClick={()=>setEditor(emptyEditor(selectedMonth))}>+ Añadir movimiento esperado</button>
    </div>

    {feedback&&<div className="forecast-feedback" role="status">{feedback}</div>}

    <section className="forecast-month-status" aria-label={`Estado de ${monthLabel(selectedMonth)}`}>
      <div><span>Movimientos</span><strong>{counts.total}</strong></div>
      <div><span>Esperados</span><strong>{counts.expected}</strong></div>
      <div><span>Recibidos</span><strong className="positive">{counts.received}</strong></div>
      <div><span>Pasados sin confirmar</span><strong className={counts.late?"negative":""}>{counts.late}</strong></div>
    </section>

    <section className="forecast-calendar" aria-label={`Calendario de ${monthLabel(selectedMonth)}`}>
      <div className="forecast-weekdays" aria-hidden="true">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
      <div className="forecast-calendar-grid">{cells.map((date,index)=>{
        if(!date)return <div key={`empty-${index}`} className="forecast-day empty" aria-hidden="true"/>;
        const events=eventsByDay.get(date)||[];
        const day=Number(date.slice(-2));
        return <div key={date} className={`forecast-day ${date===today?"today":""} ${events.length?"has-events":""}`}>
          <span className="forecast-day-number">{day}</span>
          <div className="forecast-day-events">{events.map(event=><a
            key={event.id}
            href={`#${domId(event.id)}`}
            className={`forecast-calendar-event ${event.status} ${event.estimatedAmount<0?"expense":"income"}`}
            aria-label={`${event.title}, ${statusLabel(event)}, ${formatEuro(event.estimatedAmount)}`}
            title={`${event.title} · ${formatEuro(event.estimatedAmount)} · ${statusLabel(event)}`}
          ><span>{event.title}</span><b>{formatEuro(event.estimatedAmount)}</b></a>)}</div>
        </div>;
      })}</div>
    </section>

    <section className="forecast-agenda" aria-labelledby="forecast-agenda-title">
      <div className="forecast-agenda-head"><div><p className="eyebrow">AGENDA DEL MES</p><h2 id="forecast-agenda-title">{monthLabel(selectedMonth)}</h2></div><span>{monthEvents.length} movimientos</span></div>
      {!monthEvents.length?<div className="forecast-empty"><strong>No hay movimientos previstos para este mes.</strong><p>Puedes añadir uno manualmente si sabes que llegará.</p></div>:
      <div className="forecast-agenda-list">{monthEvents.map(event=><article id={domId(event.id)} key={event.id} className={`forecast-agenda-item ${event.status}`}>
        <div className="forecast-agenda-date"><strong>{dayFmt.format(new Date(`${event.estimatedDate}T12:00:00`))}</strong><span>± {event.toleranceDays} días</span></div>
        <div className="forecast-agenda-main">
          <div className="forecast-agenda-title"><strong>{event.title}</strong><span>{sourceLabel(event)} · {recurrenceLabel(event.frequency)}</span></div>
          <div className="forecast-agenda-meta"><span>{event.category||"Sin categoría"}{event.subcategory?` · ${event.subcategory}`:""}</span><span>Fecha estimada: {dateLabel(event.estimatedDate)}</span></div>
          {event.status==="received"&&event.actual&&<div className="forecast-confirmation">
            <strong>Confirmado por un movimiento real</strong>
            <span>Previsto {formatEuro(event.estimatedAmount)} · recibido {formatEuro(event.actual.amount)} el {dateLabel(event.actual.date)}</span>
            <a href={movementHref(event)}>Ver movimiento que lo confirma →</a>
          </div>}
          {event.status==="late"&&<div className="forecast-late-note">La fecha estimada ya pasó y todavía no aparece un movimiento compatible.</div>}
          {event.status==="expected"&&<div className="forecast-expected-note">Aún no ha llegado. Se marcará como recibido cuando aparezca un movimiento bancario compatible.</div>}
        </div>
        <div className="forecast-agenda-side"><b className={event.estimatedAmount<0?"negative":"positive"}>{formatEuro(event.estimatedAmount)}</b><span className={`forecast-status ${event.status}`}>{statusLabel(event)}</span>{event.source==="manual"&&event.forecastId&&<button type="button" className="link-button" onClick={()=>cancel(event)}>Quitar</button>}</div>
      </article>)}</div>}
    </section>

    {editor&&<div className="forecast-editor-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setEditor(null);}}>
      <section className="forecast-editor" role="dialog" aria-modal="true" aria-label="Añadir movimiento esperado">
        <div className="forecast-editor-head"><div><p className="eyebrow">MOVIMIENTO ESPERADO</p><h2>Añadir al calendario</h2></div><button type="button" className="icon-action" onClick={()=>setEditor(null)} aria-label="Cerrar">×</button></div>
        <div className="forecast-editor-grid">
          <label className="wide"><span>Nombre</span><input value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})} placeholder="Ej. Seguro del coche"/></label>
          <label><span>Fecha estimada</span><input type="date" value={editor.date} onChange={e=>setEditor({...editor,date:e.target.value})}/></label>
          <label><span>Tipo</span><select value={editor.direction} onChange={e=>setEditor({...editor,direction:e.target.value as Editor["direction"]})}><option value="expense">Cargo</option><option value="income">Ingreso</option></select></label>
          <label><span>Importe estimado</span><input inputMode="decimal" value={editor.amount} onChange={e=>setEditor({...editor,amount:e.target.value})} placeholder="0,00"/></label>
          <label><span>Repetición</span><select value={editor.recurrence} onChange={e=>setEditor({...editor,recurrence:e.target.value as Editor["recurrence"]})}><option value="once">Una vez</option><option value="monthly">Mensual</option><option value="bimonthly">Bimestral</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></select></label>
          <label><span>Categoría</span><input value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})} placeholder="Ej. Seguros"/></label>
          <label><span>Subcategoría</span><input value={editor.subcategory} onChange={e=>setEditor({...editor,subcategory:e.target.value})}/></label>
          <label className="wide"><span>Entidad / concepto</span><input value={editor.counterparty} onChange={e=>setEditor({...editor,counterparty:e.target.value})} placeholder="Ayuda a identificar el cargo real"/></label>
          {editor.recurrence!=="once"&&<label><span>Repetir hasta</span><input type="date" value={editor.until} onChange={e=>setEditor({...editor,until:e.target.value})}/></label>}
          <label className="wide"><span>Notas</span><textarea rows={3} value={editor.notes} onChange={e=>setEditor({...editor,notes:e.target.value})}/></label>
        </div>
        <div className="forecast-editor-actions"><button type="button" className="ghost-action" onClick={()=>setEditor(null)}>Cancelar</button><button type="button" className="primary-action" onClick={save} disabled={loading}>Guardar</button></div>
      </section>
    </div>}
  </div>;
}
