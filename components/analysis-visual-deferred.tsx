"use client";

import { useCallback,useEffect,useRef,useState,type ComponentType } from "react";

type DashboardModule=typeof import("@/components/analysis-visual-dashboard");
type DashboardProps=Parameters<DashboardModule["AnalysisVisualDashboard"]>[0];
type LoadState="idle"|"loading"|"ready"|"error";

const PLACEHOLDER_COUNT=24;

function scheduleWhenIdle(callback:()=>void){
  if("requestIdleCallback" in window){
    const id=window.requestIdleCallback(callback,{timeout:900});
    return()=>window.cancelIdleCallback(id);
  }
  const id=window.setTimeout(callback,80);
  return()=>window.clearTimeout(id);
}

export function AnalysisVisualDeferred(props:DashboardProps){
  const anchorRef=useRef<HTMLElement|null>(null);
  const loadingRef=useRef<Promise<void>|null>(null);
  const [Dashboard,setDashboard]=useState<ComponentType<DashboardProps>|null>(null);
  const [state,setState]=useState<LoadState>("idle");

  const loadDashboard=useCallback(()=>{
    if(Dashboard||loadingRef.current)return loadingRef.current;
    setState("loading");
    const task=import("@/components/analysis-visual-dashboard")
      .then(module=>{setDashboard(()=>module.AnalysisVisualDashboard);setState("ready")})
      .catch(()=>{loadingRef.current=null;setState("error")});
    loadingRef.current=task;
    return task;
  },[Dashboard]);

  useEffect(()=>{
    if(Dashboard)return;
    const anchor=anchorRef.current;
    if(!anchor)return;
    let cancelIdle:undefined|(()=>void);
    const queueLoad=()=>{cancelIdle?.();cancelIdle=scheduleWhenIdle(()=>{void loadDashboard()})};
    if(!("IntersectionObserver" in window))queueLoad();
    else{
      const observer=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting))return;
        observer.disconnect();
        queueLoad();
      },{rootMargin:"160px 0px"});
      observer.observe(anchor);
      return()=>{observer.disconnect();cancelIdle?.()};
    }
    return()=>cancelIdle?.();
  },[Dashboard,loadDashboard]);

  if(Dashboard)return <Dashboard {...props}/>;

  return <section ref={anchorRef} className="analysis-visual-section analysis-visual-deferred" aria-labelledby="analysis-visual-deferred-title" aria-busy={state==="loading"||undefined}>
    <div className="panel-head analysis-visual-toolbar"><div><p className="eyebrow">PANEL VISUAL</p><h2 id="analysis-visual-deferred-title">24 gráficos e informes rápidos</h2><p>{state==="error"?"No se ha podido preparar el panel visual. El análisis y tus datos siguen disponibles.":"Las visualizaciones pesadas se preparan solo cuando esta sección entra en pantalla, sin bloquear el resumen superior."}</p></div><div><button className="ghost" type="button" onClick={()=>void loadDashboard()} disabled={state==="loading"}>{state==="loading"?"Preparando gráficos…":state==="error"?"Reintentar gráficos":"Cargar gráficos ahora"}</button></div></div>
    <div className="analysis-quick-reports analysis-quick-reports-placeholder" aria-hidden="true">{Array.from({length:4},(_,index)=><article key={index}><i/><b/><small/></article>)}</div>
    <div className="analysis-viz-grid analysis-viz-grid-placeholder" aria-hidden="true">{Array.from({length:PLACEHOLDER_COUNT},(_,index)=><div key={index}><article className="analysis-viz-card analysis-viz-placeholder"><i/><i/><i/></article></div>)}</div>
    <p className="sr-only" role="status" aria-live="polite">{state==="error"?"El panel de gráficos no se ha podido cargar. Puedes reintentarlo con el botón disponible.":state==="loading"?"Preparando los 24 gráficos del análisis.":"Los gráficos se cargarán automáticamente al llegar a esta sección."}</p>
  </section>;
}
