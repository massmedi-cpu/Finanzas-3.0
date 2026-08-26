"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect,useState } from "react";
import { IntentLink } from "@/components/intent-link";

const primary = [
  ["Inicio","/"],
  ["Movimientos","/movimientos"],
  ["Cuentas","/cuentas"],
  ["Plan","/plan"],
  ["Previsión","/prevision"],
  ["Análisis","/analisis"],
  ["Control","/control"],
] as const;

const secondary = [
  ["Cash Flow","/cash-flow"],
  ["Presupuesto","/presupuesto"],
  ["Objetivos","/objetivos"],
  ["Patrimonio","/patrimonio"],
  ["Reglas","/reglas"],
  ["Explicabilidad","/explicabilidad"],
  ["Archivo","/archivo"],
  ["Configuración","/configuracion"],
] as const;

const mobilePrimary = [
  ["Inicio","/"],
  ["Movimientos","/movimientos"],
  ["Plan","/plan"],
  ["Previsión","/prevision"],
] as const;

function matches(pathname:string,href:string){
  return href==="/"?pathname==="/":pathname===href||pathname.startsWith(`${href}/`);
}

export function AppNavigation({status="Datos reales · fuente solo lectura"}:{status?:string}){
  const pathname=usePathname();
  const [moreOpen,setMoreOpen]=useState(false);

  useEffect(()=>setMoreOpen(false),[pathname]);

  const navLink=(label:string,href:string)=>{
    const current=matches(pathname,href);
    return <IntentLink
      key={href}
      className={current?"active":""}
      href={href}
      aria-current={current?"page":undefined}
      onClick={()=>setMoreOpen(false)}
    >{label}</IntentLink>;
  };

  const moreActive=secondary.some(([,href])=>matches(pathname,href));

  return <header className="product-nav">
    <a className="skip-link" href="#main-content">Saltar al contenido principal</a>

    <IntentLink className="product-brand" href="/" aria-label="Financial App · Inicio" onClick={()=>setMoreOpen(false)}>
      <Image src="/brand/isotipo.png" width={36} height={36} alt="" priority/>
      <div>
        <strong>Financial App</strong>
        <small>Tu dinero, con contexto</small>
      </div>
    </IntentLink>

    <nav className="product-primary-nav" aria-label="Navegación principal">
      {primary.map(([label,href])=>navLink(label,href))}
    </nav>

    <div className="product-nav-tools">
      <span className="product-data-status" role="status">{status}</span>
      <button
        type="button"
        className={`product-more-button desktop-more ${moreActive?"active":""}`}
        aria-expanded={moreOpen}
        aria-controls="product-more-menu"
        onClick={()=>setMoreOpen(value=>!value)}
      >Más</button>
    </div>

    <nav className="mobile-nav" aria-label="Navegación principal móvil">
      {mobilePrimary.map(([label,href])=>navLink(label,href))}
      <button
        type="button"
        className={moreActive?"active":""}
        aria-expanded={moreOpen}
        aria-controls="product-more-menu"
        onClick={()=>setMoreOpen(value=>!value)}
      >Más</button>
    </nav>

    {moreOpen&&<div id="product-more-menu" className="product-more-menu" role="dialog" aria-label="Más secciones">
      <div className="product-more-head">
        <strong>Más herramientas</strong>
        <button type="button" onClick={()=>setMoreOpen(false)} aria-label="Cerrar menú">×</button>
      </div>
      {secondary.map(([label,href])=>navLink(label,href))}
    </div>}
  </header>;
}
