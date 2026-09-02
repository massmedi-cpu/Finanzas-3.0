"use client";

import type { ArchiveOverview } from "@/lib/financial/archive";
import {useCallback,useEffect,useRef,useState,type ComponentType} from "react";

type ArchiveClientModule=typeof import("./archive-client");
type ArchiveClientProps=Parameters<ArchiveClientModule["ArchiveClient"]>[0];
type LoadState="idle"|"loading"|"ready"|"error";

function archiveRefreshKey(data:ArchiveOverview){
  return [data.version,...data.documents.map(document=>`${document.id}:${document.updatedAt}:${document.ocrStatus}`)].join("|");
}

function scheduleWhenIdle(callback:()=>void){
  if("requestIdleCallback" in window){
    const id=window.requestIdleCallback(callback,{timeout:850});
    return()=>window.cancelIdleCallback(id);
  }
  const id=globalThis.setTimeout(callback,70);
  return()=>globalThis.clearTimeout(id);
}

export function ArchiveClient({initialData}:ArchiveClientProps){
  const anchorRef=useRef<HTMLDivElement|null>(null);
  const loadingRef=useRef<Promise<void>|null>(null);
  const [Core,setCore]=useState<ComponentType<ArchiveClientProps>|null>(null);
  const [state,setState]=useState<LoadState>("idle");
  const refreshKey=archiveRefreshKey(initialData);

  const loadCore=useCallback(()=>{
    if(Core||loadingRef.current)return loadingRef.current;
    setState("loading");
    const task=import("./archive-client")
      .then(module=>{setCore(()=>module.ArchiveClient);setState("ready")})
      .catch(()=>{loadingRef.current=null;setState("error")});
    loadingRef.current=task;
    return task;
  },[Core]);

  useEffect(()=>{
    if(Core)return;
    const anchor=anchorRef.current;
    if(!anchor)return;
    let cancelIdle:undefined|(()=>void);
    const queueLoad=()=>{cancelIdle?.();cancelIdle=scheduleWhenIdle(()=>{void loadCore()})};
    if(!("IntersectionObserver" in window))queueLoad();
    else{
      const observer=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting))return;
        observer.disconnect();
        queueLoad();
      },{rootMargin:"240px 0px"});
      observer.observe(anchor);
      return()=>{observer.disconnect();cancelIdle?.()};
    }
    return()=>cancelIdle?.();
  },[Core,loadCore]);

  if(Core)return <Core key={refreshKey} initialData={initialData}/>;

  return <div ref={anchorRef} className="archive-library-note archive-library-deferred" aria-busy={state==="loading"||undefined}>
    <strong>Gestión documental</strong>
    <span>{state==="error"?"La biblioteca activa no se ha podido preparar. Los documentos siguen intactos y puedes reintentar la carga.":state==="loading"?"Preparando herramientas de archivo, edición y OCR…":"Las herramientas de gestión se preparan solo al llegar a esta sección para no bloquear la carga inicial de Archivo."}</span>
    <button className="ghost" type="button" onClick={()=>void loadCore()} disabled={state==="loading"}>{state==="loading"?"Preparando…":state==="error"?"Reintentar biblioteca":"Cargar biblioteca ahora"}</button>
  </div>;
}
