"use client";

import { useCallback,useEffect,useRef,useState } from "react";

export type NetworkState="checking"|"online"|"offline"|"restored";
export type ConfirmedNetworkState="online"|"offline"|null;

export function resolveNetworkState(previous:ConfirmedNetworkState,online:boolean):NetworkState{
  if(!online)return "offline";
  return previous==="offline"?"restored":"online";
}

export function useNetworkStatus(){
  const[state,setState]=useState<NetworkState>("checking");
  const[checking,setChecking]=useState(true);
  const confirmedRef=useRef<"online"|"offline"|null>(null);
  const requestRef=useRef<AbortController|null>(null);
  const restoredTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  const confirm=useCallback((online:boolean)=>{
    const previous=confirmedRef.current;
    confirmedRef.current=online?"online":"offline";
    const next=resolveNetworkState(previous,online);
    if(restoredTimerRef.current)clearTimeout(restoredTimerRef.current);
    if(next==="offline"){
      setState(next);
      return;
    }
    if(next==="restored"){
      setState(next);
      restoredTimerRef.current=setTimeout(()=>setState("online"),4500);
      return;
    }
    setState(next);
  },[]);

  const check=useCallback(async()=>{
    requestRef.current?.abort();
    if(typeof navigator!=="undefined"&&!navigator.onLine){
      confirm(false);
      setChecking(false);
      return false;
    }
    const controller=new AbortController();
    requestRef.current=controller;
    const timeout=setTimeout(()=>controller.abort(),5000);
    setChecking(true);
    try{
      const response=await fetch("/manifest.webmanifest",{method:"HEAD",cache:"no-store",signal:controller.signal});
      confirm(response.ok);
      return response.ok;
    }catch{
      if(requestRef.current===controller)confirm(false);
      return false;
    }finally{
      clearTimeout(timeout);
      if(requestRef.current===controller)requestRef.current=null;
      setChecking(false);
    }
  },[confirm]);

  useEffect(()=>{
    void check();
    const onOnline=()=>void check();
    const onOffline=()=>{
      requestRef.current?.abort();
      confirm(false);
      setChecking(false);
    };
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return ()=>{
      window.removeEventListener("online",onOnline);
      window.removeEventListener("offline",onOffline);
      requestRef.current?.abort();
      if(restoredTimerRef.current)clearTimeout(restoredTimerRef.current);
    };
  },[check,confirm]);

  return {state,checking,retry:check};
}

export function NetworkStatusBanner({state,checking,onRetry}:{state:NetworkState;checking:boolean;onRetry:()=>void}){
  if(state==="online"||state==="checking")return null;
  const offline=state==="offline";
  return <aside className={`network-status-banner ${state}`} role={offline?"alert":"status"} aria-live={offline?"assertive":"polite"} aria-atomic="true">
    <span className="network-status-dot" aria-hidden="true"/>
    <span className="network-status-copy">
      <strong>{offline?"Sin conexión":"Conexión restablecida"}</strong>
      <span>{offline?"Puedes consultar lo que ya está en pantalla, pero no actualizar ni guardar datos.":"Financial App vuelve a comunicarse con el servidor."}</span>
    </span>
    {offline&&<button type="button" className="network-status-retry" onClick={onRetry} disabled={checking}>{checking?"Comprobando…":"Reintentar"}</button>}
  </aside>;
}
