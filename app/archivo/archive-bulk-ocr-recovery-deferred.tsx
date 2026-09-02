"use client";

import {useCallback,useEffect,useRef,useState,type ComponentType} from "react";

type RecoveryModule=typeof import("./archive-bulk-ocr-recovery");
type RecoveryProps=Parameters<RecoveryModule["ArchiveBulkOcrRecovery"]>[0];
type LoadState="idle"|"loading"|"ready"|"error";

function scheduleWhenIdle(callback:()=>void){
  if("requestIdleCallback" in window){
    const id=window.requestIdleCallback(callback,{timeout:700});
    return()=>window.cancelIdleCallback(id);
  }
  const id=globalThis.setTimeout(callback,60);
  return()=>globalThis.clearTimeout(id);
}

export function ArchiveBulkOcrRecoveryDeferred(props:RecoveryProps){
  const loadingRef=useRef<Promise<void>|null>(null);
  const [Recovery,setRecovery]=useState<ComponentType<RecoveryProps>|null>(null);
  const [state,setState]=useState<LoadState>("idle");

  const loadRecovery=useCallback(()=>{
    if(Recovery||loadingRef.current)return loadingRef.current;
    setState("loading");
    const task=import("./archive-bulk-ocr-recovery")
      .then(module=>{setRecovery(()=>module.ArchiveBulkOcrRecovery);setState("ready")})
      .catch(()=>{loadingRef.current=null;setState("error")});
    loadingRef.current=task;
    return task;
  },[Recovery]);

  useEffect(()=>{
    if(Recovery)return;
    const cancel=scheduleWhenIdle(()=>{void loadRecovery()});
    return()=>cancel();
  },[Recovery,loadRecovery]);

  if(Recovery)return <Recovery {...props}/>;
  if(state!=="error")return <span className="archive-recovery-deferred-anchor" aria-hidden="true"/>;

  return <div className="archive-library-note" role="status">
    <strong>Actualización OCR disponible</strong>
    <span>No se ha podido preparar el recuperador OCR. Los documentos y sus asociaciones permanecen intactos.</span>
    <button className="ghost" type="button" onClick={()=>void loadRecovery()}>Reintentar recuperación OCR</button>
  </div>;
}
