"use client";

import { useRouter } from "next/navigation";
import { useEffect,useRef,useState,useTransition } from "react";

type SyncState="idle"|"busy"|"done"|"unchanged"|"warning"|"error";
type SyncButtonProps={reconciliationPending?:boolean;sourceModifiedAt?:string|null;lastSyncAt?:string|null;autoSync?:boolean;};
type SyncDiagnostics={verificationStatus?:string;sourceChanged?:boolean;sourceUnchanged?:boolean;sourceChangedNoMovementRows?:boolean;sourceModifiedAt?:string|null;lastCheckAt?:string|null;sourceRowCount?:number|null;rowsSeen?:number|null;newCount?:number;updatedCount?:number;reviewSourceCount?:number;latestMovementDate?:string|null;documentChanged?:boolean;autoLinked?:number;};
const AUTO_SYNC_COOLDOWN_MS=15*60*1000;
const AUTO_SYNC_STALE_MS=30*60*1000;
const AUTO_SYNC_KEY="financial-app-auto-sync-at";
const dayFormat=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
function ageMs(value:string|null|undefined){if(!value)return Number.POSITIVE_INFINITY;const parsed=new Date(value).getTime();return Number.isFinite(parsed)?Date.now()-parsed:Number.POSITIVE_INFINITY;}
function movementDate(value:string|null|undefined){return value?dayFormat.format(new Date(`${value.slice(0,10)}T12:00:00`)):"sin fecha"}
function diagnosticsText(value:SyncDiagnostics|null){
  if(!value||value.verificationStatus==="unavailable")return null;
  const extras=[] as string[];
  if(value.documentChanged)extras.push("documentos actualizados");
  if(Number(value.autoLinked||0)>0)extras.push(`${Number(value.autoLinked)} documento${Number(value.autoLinked)===1?"":"s"} vinculado${Number(value.autoLinked)===1?"":"s"}`);
  const suffix=extras.length?` · ${extras.join(" · ")}`:"";
  if(value.sourceUnchanged)return `XLSX comprobado sin cambios · último movimiento ${movementDate(value.latestMovementDate)}${suffix}`;
  if(value.sourceChangedNoMovementRows)return `El XLSX cambió, pero no produjo movimientos nuevos o modificados · último movimiento ${movementDate(value.latestMovementDate)}${suffix}`;
  const parts=[`${Number(value.newCount||0)} nuevos`,`${Number(value.updatedCount||0)} modificados`];
  if(Number(value.reviewSourceCount||0)>0)parts.push(`${Number(value.reviewSourceCount)} ausentes en origen`);
  if(value.rowsSeen!=null)parts.push(`${value.rowsSeen} filas leídas`);
  parts.push(`último movimiento ${movementDate(value.latestMovementDate)}`);
  return `${parts.join(" · ")}${suffix}`;
}

export function SyncButton({reconciliationPending=false,sourceModifiedAt=null,lastSyncAt=null,autoSync=false}:SyncButtonProps){
  const router=useRouter();
  const [state,setState]=useState<SyncState>("idle");
  const [pendingReconciliation,setPendingReconciliation]=useState(reconciliationPending);
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [diagnostics,setDiagnostics]=useState<SyncDiagnostics|null>(null);
  const [refreshing,startRefresh]=useTransition();
  const autoStarted=useRef(false);

  async function sync(trigger:"manual"|"auto"="manual"){
    if(state==="busy"||refreshing)return;
    setState("busy");setErrorMessage(null);setDiagnostics(null);
    if(trigger==="auto")localStorage.setItem(AUTO_SYNC_KEY,String(Date.now()));
    try{
      const response=await fetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:"{}",cache:"no-store"});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){setErrorMessage(data?.error||`sync_${response.status}`);setState("error");return;}
      const nextDiagnostics=(data?.diagnostics&&typeof data.diagnostics==="object"?data.diagnostics:null) as SyncDiagnostics|null;
      setDiagnostics(nextDiagnostics);
      const documentWarning=data?.documents?.ok===false;
      const verificationWarning=nextDiagnostics?.sourceChangedNoMovementRows===true;
      const reconciliationCompleted=pendingReconciliation&&!documentWarning;
      if(reconciliationCompleted)setPendingReconciliation(false);
      if(documentWarning){setErrorMessage(`Documentos Drive: ${String(data.documents.error||"no disponibles")}`);setState("warning");}
      else if(verificationWarning)setState("warning");
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
    const freshnessAnchor=lastSyncAt||sourceModifiedAt;
    const stale=pendingReconciliation||ageMs(freshnessAnchor)>=AUTO_SYNC_STALE_MS;
    if(cooldownElapsed&&stale)void sync("auto");
  // Solo al montar: router.refresh() no puede crear un bucle de sincronización.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const idleLabel=pendingReconciliation?"Reconciliar Drive":"Actualizar datos";
  const label=refreshing?"Aplicando cambios…":state==="busy"?"Actualizando…":state==="done"?"Actualizado":state==="unchanged"?"Sin cambios":state==="warning"?"Actualizado con aviso":state==="error"?"Error al actualizar":idleLabel;
  const result=diagnosticsText(diagnostics);
  const title=errorMessage||result||(pendingReconciliation?"Drive necesita una reconciliación completa":"Actualiza movimientos y documentos de Google Drive");
  return <div className="sync-button-stack">
    <button className="ghost" type="button" onClick={()=>void sync("manual")} disabled={state==="busy"||refreshing} title={title} aria-live="polite">{label}</button>
    {result&&<small className={`sync-result ${state}`} role="status">{result}</small>}
  </div>;
}
