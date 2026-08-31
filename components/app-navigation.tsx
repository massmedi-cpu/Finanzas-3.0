"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect,useState } from "react";
import { IntentLink } from "@/components/intent-link";
import { FinancialIcon,type FinancialIconName } from "@/components/financial-icons";

const primary = [
  ["Inicio","/","home"],
  ["Cash Flow","/cash-flow","cash-flow"],
  ["Movimientos","/movimientos","movements"],
  ["Análisis","/analisis","analysis"],
  ["Previsión","/prevision","forecast"],
  ["Archivo","/archivo","archive"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];

const secondary = [
  ["Cuentas","/cuentas","accounts"],
  ["Categorías","/configuracion#categorias","categories"],
  ["Plan","/plan","plan"],
  ["Simulador","/escenarios","plan"],
  ["Presupuesto","/presupuesto","budget"],
  ["Objetivos","/objetivos","goals"],
  ["Patrimonio","/patrimonio","net-worth"],
  ["Inteligencia","/inteligencia","intelligence"],
  ["Reglas","/reglas","rules"],
  ["Importación","/configuracion#importacion","import"],
  ["OCR","/archivo/revision","scan"],
  ["Integraciones","/configuracion#integraciones","integrations"],
  ["Centro de control","/control","control"],
  ["Explicabilidad","/explicabilidad","explain"],
  ["Configuración","/configuracion","settings"],
] as const satisfies readonly (readonly [string,string,FinancialIconName])[];

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

export function AppNavigation({status="Datos reales · fuente solo lectura"}:{status?:string}){
  const pathname=usePathname();
  const [moreOpen,setMoreOpen]=useState(false);
  useEffect(()=>setMoreOpen(false),[pathname]);
  useEffect(()=>{
    if(!moreOpen)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setMoreOpen(false);};
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[moreOpen]);

  const primaryLink=(label:string,href:string,icon:FinancialIconName,compact=false)=>{
    const current=matches(pathname,href);
    return <IntentLink key={href} className={`product-nav-item${current?" active":""}${compact?" compact":""}`} href={href} aria-current={current?"page":undefined} onClick={()=>setMoreOpen(false)}>
      <FinancialIcon name={icon} active={current}/><span>{label}</span>
    </IntentLink>;
  };
  const moreActive=secondary.some(([,href])=>secondaryMatches(pathname,href));

  return <>
    <a className="skip-link" href="#main-content">Saltar al contenido principal</a>

    <aside className="product-sidebar" aria-label="Navegación de Financial App">
      <IntentLink className="product-brand" href="/" aria-label="Financial App · Inicio" onClick={()=>setMoreOpen(false)}>
        <span className="product-brand-mark"><Image src="/brand/isotipo.png" width={42} height={42} alt="" priority/></span>
        <span className="product-brand-copy"><strong>Financial App</strong><small>Finanzas personales</small></span>
      </IntentLink>
      <nav className="product-primary-nav" aria-label="Navegación principal">
        {primary.map(([label,href,icon])=>primaryLink(label,href,icon))}
      </nav>
      <div className="product-sidebar-footer">
        <button type="button" className={`product-more-button${moreActive?" active":""}`} aria-expanded={moreOpen} aria-controls="product-more-menu" onClick={()=>setMoreOpen(value=>!value)}>
          <FinancialIcon name="more" active={moreActive}/><span>Más</span>
        </button>
        <span className="product-data-status" role="status">{status}</span>
      </div>
    </aside>

    <header className="mobile-product-header">
      <IntentLink className="mobile-brand" href="/" aria-label="Financial App · Inicio" onClick={()=>setMoreOpen(false)}><Image src="/brand/isotipo.png" width={36} height={36} alt="" priority/><strong>Financial App</strong></IntentLink>
      <button type="button" className={`mobile-more-trigger${moreActive?" active":""}`} aria-label="Más secciones" aria-expanded={moreOpen} aria-controls="product-more-menu" onClick={()=>setMoreOpen(value=>!value)}><FinancialIcon name="more" active={moreActive}/></button>
    </header>

    <nav className="mobile-bottom-nav" aria-label="Navegación principal móvil">
      {primary.map(([label,href,icon])=>primaryLink(label,href,icon,true))}
    </nav>

    {moreOpen&&<>
      <button className="product-more-backdrop" type="button" aria-label="Cerrar Más" onClick={()=>setMoreOpen(false)}/>
      <section id="product-more-menu" className="product-more-menu" role="dialog" aria-modal="true" aria-label="Más herramientas">
        <div className="product-more-head"><div><strong>Más</strong><span>Herramientas y configuración</span></div><button type="button" className="icon-button" onClick={()=>setMoreOpen(false)} aria-label="Cerrar menú"><FinancialIcon name="close"/></button></div>
        <nav className="product-more-grid" aria-label="Herramientas secundarias">
          {secondary.map(([label,href,icon])=>{
            const current=secondaryMatches(pathname,href);
            return <IntentLink key={`${href}-${label}`} className={`product-more-item${current?" active":""}`} href={href} aria-current={current?"page":undefined} onClick={()=>setMoreOpen(false)}><span className="product-more-icon"><FinancialIcon name={icon} active={current}/></span><span>{label}</span><FinancialIcon className="product-more-chevron" name="chevron-right"/></IntentLink>;
          })}
        </nav>
      </section>
    </>}
  </>;
}
