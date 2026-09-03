"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import type { ControlAlertState } from "@/lib/financial/control";

type Feedback={tone:"success"|"error"|"warning";message:string};
type ApiErrorPayload={error?:string};

async function postControl(payload:unknown){
  const response=await fetch("/api/control",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
  });
  const body=await response.json().catch(()=>({})) as ApiErrorPayload;
  if(!response.ok)throw new Error(body.error||"No se ha podido actualizar el centro de control");
}

function ActionFeedback({feedback}:{feedback:Feedback|null}){
  if(!feedback)return null;
  return <div className={`inline-alert ${feedback.tone} module-feedback`} role={feedback.tone==="error"?"alert":"status"} aria-live="polite">{feedback.message}</div>;
}

export function ControlAlertActions({alertKey,originHref}:{alertKey:string;originHref:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [refreshing,startTransition]=useTransition();
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const disabled=busy||refreshing;

  async function act(action:ControlAlertState){
    setBusy(true);setFeedback(null);
    try{
      await postControl({kind:"alert",key:alertKey,action,days:7});
      setFeedback({tone:"success",message:action==="resolved"?"Aviso marcado como resuelto.":action==="snoozed"?"Aviso pospuesto 7 días.":action==="dismissed"?"Aviso ignorado.":"Aviso reabierto."});
      startTransition(()=>router.refresh());
    }catch(error){
      setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido actualizar el aviso"});
    }finally{setBusy(false);}
  }

  return <>
    <div className="alert-actions">
      <Link className="text-button button-link" href={originHref}>Abrir origen →</Link><span/>
      <button type="button" className="text-button" onClick={()=>act("snoozed")} disabled={disabled}>Posponer 7 días</button>
      <button type="button" className="text-button" onClick={()=>act("resolved")} disabled={disabled}>Marcar resuelto</button>
      <button type="button" className="text-button muted" onClick={()=>act("dismissed")} disabled={disabled}>Ignorar</button>
    </div>
    <ActionFeedback feedback={feedback}/>
  </>;
}

export function CloseMonthActions({month,monthLabel,closeReady}:{month:string;monthLabel:string;closeReady:boolean}){
  const router=useRouter();
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [refreshing,startTransition]=useTransition();
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const disabled=busy||refreshing;

  async function closeMonth(){
    if(!closeReady){setFeedback({tone:"warning",message:"Este mes todavía tiene bloqueos que deben resolverse antes del cierre."});return;}
    if(!window.confirm(`¿Cerrar ${monthLabel}? Se guardará una fotografía verificable de sus cifras y avisos.`))return;
    setBusy(true);setFeedback(null);
    try{
      await postControl({kind:"close",month,notes});
      setNotes("");
      setFeedback({tone:"success",message:`Cierre de ${monthLabel} guardado.`});
      startTransition(()=>router.refresh());
    }catch(error){
      const message=error instanceof Error?error.message:"No se ha podido cerrar el mes";
      setFeedback({tone:"error",message:message==="month_has_blockers"?"El mes tiene bloqueos pendientes.":message});
    }finally{setBusy(false);}
  }

  return <div className="close-form">
    <label>Nota de cierre <small>Opcional</small><textarea rows={3} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Incidencias o contexto del mes"/></label>
    <button className="primary-action" type="button" onClick={closeMonth} disabled={disabled||!closeReady} aria-busy={disabled?"true":undefined}>{closeReady?"Cerrar mes y guardar snapshot":"Resuelve los bloqueos para cerrar"}</button>
    <ActionFeedback feedback={feedback}/>
  </div>;
}

export function ReopenMonthAction({month,monthLabel}:{month:string;monthLabel:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [refreshing,startTransition]=useTransition();
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const disabled=busy||refreshing;

  async function reopen(){
    if(!window.confirm(`¿Reabrir ${monthLabel}? El snapshot histórico se conserva, pero el mes volverá a quedar editable para un nuevo cierre.`))return;
    setBusy(true);setFeedback(null);
    try{
      await postControl({kind:"reopen",month});
      setFeedback({tone:"success",message:`Mes ${monthLabel} reabierto.`});
      startTransition(()=>router.refresh());
    }catch(error){
      setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido reabrir el mes"});
    }finally{setBusy(false);}
  }

  return <><button className="ghost" type="button" onClick={reopen} disabled={disabled}>Reabrir mes</button><ActionFeedback feedback={feedback}/></>;
}
