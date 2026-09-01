"use client";

import { useRouter } from "next/navigation";
import { useEffect,useRef,useState,useTransition } from "react";

type SyncState="idle"|"busy"|"done"|"unchanged"|"warning"|"error";
type SyncButtonProps={reconciliationPending?:boolean;sourceModifiedAt?:string|null;lastSyncAt?:string|null;autoSync?:boolean;};
const AUTO_SYNC_COOLDOWN_MS=15*60*1000;
const AUTO_SYNC_STALE_MS=30*60*1000;
const AUTO_SYNC_KEY="financial-app-auto-sync-at";
function ageMs(value:string|null|undefined){if(!value)return Number.POSITIVE_INFINITY;const parsed=new Date(value).getTime();return Number.isFinite(parsed)?Date.now()-parsed:Number.POSITIVE_INFINITY;}

export function SyncButton({reconciliationPending=false,sourceModifiedAt=null,lastSyncAt=null,autoSync=false}:SyncButtonProps){
  const router=useRouter();
  const [state,setState]=useState<SyncState>("idle");
  const [pendingReconciliation,setPendingReconciliation]=useState(reconciliationPending);
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [refreshing,startRefresh]=useTransition();
  const autoStarted=useRef(false);

  async function sync(trigger:"manual"|"auto"="manual"){
    if(state==="busy"||refreshing)return;
    setState("busy");setErrorMessage(null);
    if(trigger==="auto")localStorage.setItem(AUTO_SYNC_KEY,String(Date.now()));
    try{
      const response=await fetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:"{}",cache:"no-store"});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){setErrorMessage(data?.error||`sync_${response.status}`);setState("error");return;}
      const documentWarning=data?.documents?.ok===false;
      const reconciliationCompleted=pendingReconciliation&&!documentWarning;
      if(reconciliationCompleted)setPendingReconciliation(false);
      if(documentWarning){setErrorMessage(`Documentos Drive: ${String(data.documents.error||"no disponibles")}`);setState("warning");}
      else if(data?.changed===true||reconciliationCompleted)setState("done");
      else setState("unchanged");
      startRefresh(()=>router.refresh());
    }catch{setErrorMessage("sync_unavailable");setState("error");}
  }

  useEffect(()=>{
    if(!autoSync||autoStarted.current)return;
    autoStarted.current=true;
    const lastAuto=Number(localStorage.getItem(AUTO_SYNC_KEY)||"0");
    const cooldownElapsed=!Number.isFinite(lastAuto)||Date.now()-lastAuto>=AUTO_SYNC_COOLDOWN_MS;
    const stale=pendingReconciliation||ageMs(lastSyncAt)>=AUTO_SYNC_STALE_MS||ageMs(sourceModifiedAt)>=AUTO_SYNC_STALE_MS;
    if(cooldownElapsed&&stale)void sync("auto");
  // Solo al montar: router.refresh() no puede crear un bucle de sincronización.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const idleLabel=pendingReconciliation?"Reconciliar Drive":"Actualizar datos";
  const label=refreshing?"Aplicando cambios…":state==="busy"?"Actualizando…":state==="done"?"Actualizado":state==="unchanged"?"Sin cambios":state==="warning"?"Actualizado con aviso":state==="error"?"Error al actualizar":idleLabel;
  const title=errorMessage||(pendingReconciliation?"Drive necesita una reconciliación completa":"Actualiza movimientos y documentos de Google Drive");
  return <button className="ghost" type="button" onClick={()=>void sync("manual")} disabled={state==="busy"||refreshing} title={title} aria-live="polite">{label}</button>;
}
