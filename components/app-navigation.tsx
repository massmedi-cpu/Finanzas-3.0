"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect,useRef,useState } from "react";
import { IntentLink } from "@/components/intent-link";
import { FinancialIcon,type FinancialIconName } from "@/components/financial-icons";
import type { NetworkState } from "@/components/network-status";

const primary = [
  ["Inicio","/","home"],
  ["Cash Flow","/cash-flow","cash-flow"],
  ["Movimientos","/movimientos","movements"],
  ["Análisis","/analisis","analysis"],
  ["Previsión","/prevision","forecast"],
  ["Archivo","/archivo","archive"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];

const secondaryOrganize = [
  ["Cuentas","/cuentas","accounts"],
  ["Categorías","/configuracion#categorias","categories"],
  ["Presupuesto","/presupuesto","budget"],
  ["Reglas","/reglas","rules"],
  ["Importación","/configuracion#importacion","import"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];
const secondaryPlan = [
  ["Plan","/plan","plan"],
  ["Simulador","/escenarios","plan"],
  ["Objetivos","/objetivos","goals"],
  ["Patrimonio","/patrimonio","net-worth"],
  ["Inteligencia","/inteligencia","intelligence"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];
const secondarySystem = [
  ["OCR","/archivo/revision","scan"],
  ["Integraciones","/configuracion#integraciones","integrations"],
  ["Centro de control","/control","control"],
  ["Explicabilidad","/explicabilidad","explain"],
  ["Configuración","/configuracion","settings"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];
const secondaryGroups = [
  {key:"organize",label:"Organizar",items:secondaryOrganize},
  {key:"plan",label:"Planificar",items:secondaryPlan},
  {key:"system",label:"Sistema",items:secondarySystem},
] as const;
const secondary = [...secondaryOrganize,...secondaryPlan,...secondarySystem] as const;

function routeOf(href:string){return href.split("#")[0];}
function matches(pathname:string,href:string){
  const route=routeOf(href);
  return route==="/"?pathname==="/":pathname===route||pathname.startsWith(`${route}/`);
}
function secondaryMatches(pathname:string,href:string){
  const route=routeOf(href);
  const primaryOwner=primary.some(([,primaryHref])=>routeOf(primaryHref)===route);
  if(primaryOwner)return pathname!==route&&matches(pathname,href);
  return matches(pathname,href);
}

export function AppNavigation({status="Datos reales · fuente solo lectura",statusTone="online"}:{status?:string;statusTone?:NetworkState}){
  const pathname=usePathname();
  const [moreOpen,setMoreOpen]=useState(false);
  const dialogRef=useRef<HTMLElement>(null);
  const triggerRef=useRef<HTMLButtonElement|null>(null);

  useEffect(()=>setMoreOpen(false),[pathname]);
  useEffect(()=>{
    if(!moreOpen)return;
    const root=document.documentElement;
    const previousOverflow=root.style.overflow;
    root.style.overflow="hidden";
    const focusable=()=>Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')||[])
      .filter(node=>node.getAttribute("aria-hidden")!=="true");
    const frame=requestAnimationFrame(()=>focusable()[0]?.focus());
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        event.preventDefault();
        setMoreOpen(false);
        requestAnimationFrame(()=>triggerRef.current?.focus());
        return;
      }
      if(event.key!=="Tab")return;
      const nodes=focusable();
      if(!nodes.length){event.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener("keydown",onKeyDown);
    return ()=>{
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown",onKeyDown);
      root.style.overflow=previousOverflow;
    };
  },[moreOpen]);

  function closeMore(restoreFocus=false){
    setMoreOpen(false);
    if(restoreFocus)requestAnimationFrame(()=>triggerRef.current?.focus());
  }
  function toggleMore(button:HTMLButtonElement){
    triggerRef.current=button;
    setMoreOpen(value=>!value);
  }
  const primaryLink=(label:string,href:string,icon:FinancialIconName,compact=false)=>{
    const current=matches(pathname,href);
    return <IntentLink key={href} className={`product-nav-item${current?" active":""}${compact?" compact":""}`} href={href} aria-current={current?"page":undefined} onClick={()=>closeMore()}>
      <FinancialIcon name={icon} active={current}/><span>{label}</span>
    </IntentLink>;
  };
  const moreActive=secondary.some(([,href])=>secondaryMatches(pathname,href));

  return <>
    <a className="skip-link" href="#main-content">Saltar al contenido principal</a>

    <aside className="product-sidebar" aria-label="Navegación de Financial App">
      <IntentLink className="product-brand" href="/" aria-label="Financial App · Inicio" onClick={()=>closeMore()}>
        <span className="product-brand-mark"><Image src="/brand/isotipo.png" width={42} height={42} alt="" priority/></span>
        <span className="product-brand-copy"><strong>Financial App</strong><small>Finanzas personales</small></span>
      </IntentLink>
      <nav className="product-primary-nav" aria-label="Navegación principal">
        {primary.map(([label,href,icon])=>primaryLink(label,href,icon))}
      </nav>
      <div className="product-sidebar-footer">
        <button type="button" className={`product-more-button${moreActive?" active":""}`} aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="product-more-menu" onClick={event=>toggleMore(event.currentTarget)}>
          <FinancialIcon name="more" active={moreActive}/><span>Más</span>
        </button>
        <span className={`product-data-status ${statusTone}`} role="status" aria-live="polite">{status}</span>
      </div>
    </aside>

    <header className="mobile-product-header">
      <IntentLink className="mobile-brand" href="/" aria-label="Financial App · Inicio" onClick={()=>closeMore()}><Image src="/brand/isotipo.png" width={36} height={36} alt="" priority/><strong>Financial App</strong></IntentLink>
      <button type="button" className={`mobile-more-trigger${moreActive?" active":""}`} aria-label="Más secciones" aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="product-more-menu" onClick={event=>toggleMore(event.currentTarget)}><FinancialIcon name="more" active={moreActive}/></button>
    </header>

    <nav className="mobile-bottom-nav" aria-label="Navegación principal móvil">
      {primary.map(([label,href,icon])=>primaryLink(label,href,icon,true))}
    </nav>

    {moreOpen&&<>
      <button className="product-more-backdrop" type="button" aria-label="Cerrar Más" onClick={()=>closeMore(true)}/>
      <section ref={dialogRef} id="product-more-menu" className="product-more-menu" role="dialog" aria-modal="true" aria-labelledby="product-more-title">
        <div className="product-more-head"><div><h2 id="product-more-title">Más</h2><span>Herramientas y configuración</span></div><button type="button" className="icon-button" onClick={()=>closeMore(true)} aria-label="Cerrar menú"><FinancialIcon name="close"/></button></div>
        <nav className="product-more-groups" aria-label="Herramientas secundarias">
          {secondaryGroups.map(group=><section key={group.key} className="product-more-group" aria-labelledby={`product-more-${group.key}`}>
            <h3 id={`product-more-${group.key}`}>{group.label}</h3>
            <div className="product-more-grid">
              {group.items.map(([label,href,icon])=>{
                const current=secondaryMatches(pathname,href);
                return <IntentLink key={`${href}-${label}`} className={`product-more-item${current?" active":""}`} href={href} aria-current={current?"page":undefined} onClick={()=>closeMore()}><span className="product-more-icon"><FinancialIcon name={icon} active={current}/></span><span>{label}</span><FinancialIcon className="product-more-chevron" name="chevron-right"/></IntentLink>;
              })}
            </div>
          </section>)}
        </nav>
      </section>
    </>}
  </>;
}
