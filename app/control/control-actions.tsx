"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext,useContext,useState,useTransition,type ReactNode } from "react";
import type { ControlAlertState } from "@/lib/financial/control";

type Feedback={tone:"success"|"error"|"warning";message:string};
type ApiErrorPayload={error?:string};
type MutationContextValue={disabled:boolean;run:(task:()=>Promise<Feedback>)=>Promise<void>;show:(feedback:Feedback)=>void;feedback:Feedback|null};

const MutationContext=createContext<MutationContextValue|null>(null);

async function postControl(payload:unknown){
  const response=await fetch("/api/control",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
  });
  const body=await response.json().catch(()=>({})) as ApiErrorPayload;
  if(!response.ok)throw new Error(body.error||"No se ha podido actualizar el centro de control");
}

function useControlMutation(){
  const context=useContext(MutationContext);
  if(!context)throw new Error("control_mutation_boundary_missing");
  return context;
}

export function ControlMutationBoundary({children}:{children:ReactNode}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [refreshing,startTransition]=useTransition();
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const disabled=busy||refreshing;

  async function run(task:()=>Promise<Feedback>){
    if(disabled)return;
    setBusy(true);setFeedback(null);
    try{
      const nextFeedback=await task();
      setFeedback(nextFeedback);
      startTransition(()=>router.refresh());
    }catch(error){
      setFeedback({tone:"error",message:error instanceof Error?error.message:"No se ha podido actualizar el centro de control"});
    }finally{setBusy(false);}
  }

  return <MutationContext.Provider value={{disabled,run,show:setFeedback,feedback}}><div className={`control-module ${disabled?"is-loading":""}`} aria-busy={disabled?"true":undefined}>{children}</div></MutationContext.Provider>;
}

export function ControlMutationFeedback(){
  const {feedback}=useControlMutation();
  if(!feedback)return null;
  return <div className={`inline-alert ${feedback.tone} module-feedback`} role={feedback.tone==="error"?"alert":"status"} aria-live="polite">{feedback.message}</div>;
}

export function ControlAlertActions({alertKey,originHref}:{alertKey:string;originHref:string}){
  const {disabled,run}=useControlMutation();

  async function act(action:ControlAlertState){
    await run(async()=>{
      await postControl({kind:"alert",key:alertKey,action,days:7});
      return{tone:"success",message:action==="resolved"?"Aviso marcado como resuelto.":action==="snoozed"?"Aviso pospuesto 7 días.":action==="dismissed"?"Aviso ignorado.":"Aviso reabierto."};
    });
  }

  return <div className="alert-actions">
    <Link className="text-button button-link" href={originHref}>Abrir origen →</Link><span/>
    <button type="button" className="text-button" onClick={()=>act("snoozed")} disabled={disabled}>Posponer 7 días</button>
    <button type="button" className="text-button" onClick={()=>act("resolved")} disabled={disabled}>Marcar resuelto</button>
    <button type="button" className="text-button muted" onClick={()=>act("dismissed")} disabled={disabled}>Ignorar</button>
  </div>;
}

export function CloseMonthActions({month,monthLabel,closeReady}:{month:string;monthLabel:string;closeReady:boolean}){
  const {disabled,run,show}=useControlMutation();
  const [notes,setNotes]=useState("");

  async function closeMonth(){
    if(!closeReady){show({tone:"warning",message:"Este mes todavía tiene bloqueos que deben resolverse antes del cierre."});return;}
    if(!window.confirm(`¿Cerrar ${monthLabel}? Se guardará una fotografía verificable de sus cifras y avisos.`))return;
    await run(async()=>{
      try{await postControl({kind:"close",month,notes});}
      catch(error){const message=error instanceof Error?error.message:"No se ha podido cerrar el mes";throw new Error(message==="month_has_blockers"?"El mes tiene bloqueos pendientes.":message);}
      setNotes("");
      return{tone:"success",message:`Cierre de ${monthLabel} guardado.`};
    });
  }

  return <div className="close-form">
    <label>Nota de cierre <small>Opcional</small><textarea rows={3} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Incidencias o contexto del mes"/></label>
    <button className="primary-action" type="button" onClick={closeMonth} disabled={disabled||!closeReady} aria-busy={disabled?"true":undefined}>{closeReady?"Cerrar mes y guardar snapshot":"Resuelve los bloqueos para cerrar"}</button>
  </div>;
}

export function ReopenMonthAction({month,monthLabel}:{month:string;monthLabel:string}){
  const {disabled,run}=useControlMutation();

  async function reopen(){
    if(!window.confirm(`¿Reabrir ${monthLabel}? El snapshot histórico se conserva, pero el mes volverá a quedar editable para un nuevo cierre.`))return;
    await run(async()=>{
      await postControl({kind:"reopen",month});
      return{tone:"success",message:`Mes ${monthLabel} reabierto.`};
    });
  }

  return <button className="ghost" type="button" onClick={reopen} disabled={disabled}>Reabrir mes</button>;
}
