"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect,useState } from "react";

const sections = [
  ["Inicio", "/"],["Plan", "/plan"],["Control", "/control"],["Cuentas", "/cuentas"],["Movimientos", "/movimientos"],["Reglas", "/reglas"],["Cash Flow", "/cash-flow"],["Presupuesto", "/presupuesto"],["Objetivos", "/objetivos"],["Previsión", "/prevision"],["Patrimonio", "/patrimonio"],["Análisis", "/analisis"],["Archivo", "/archivo"],["Configuración", "/configuracion"],
] as const;
const mobilePrimary = [["Inicio","/"],["Plan","/plan"],["Movimientos","/movimientos"],["Control","/control"]] as const;
const mobileMore = sections.filter(([,href])=>!mobilePrimary.some(([,primaryHref])=>primaryHref===href));
function matches(pathname:string,href:string){return href==="/"?pathname==="/":pathname===href||pathname.startsWith(`${href}/`)}

export function AppSidebar({ active, status = "Datos reales · fuente solo lectura" }: { active?: string; status?: string }) {
  const pathname=usePathname();const [moreOpen,setMoreOpen]=useState(false);const currentPath=active||pathname;
  useEffect(()=>setMoreOpen(false),[pathname]);
  const navLink=(label:string,href:string)=>{const current=matches(currentPath,href);return <Link key={href} className={current?"active":""} href={href} aria-current={current?"page":undefined}>{label}</Link>};
  const moreActive=mobileMore.some(([,href])=>matches(currentPath,href));
  return <aside className="sidebar">
    <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
    <Link className="brand" href="/" aria-label="Financial App · Inicio"><Image className="brand-icon" src="/brand/isotipo.png" width={42} height={42} alt="" priority/><div><strong>Financial App</strong><small>Control financiero personal</small></div></Link>
    <nav className="desktop-nav" aria-label="Navegación principal">{sections.map(([label,href])=>navLink(label,href))}</nav>
    <nav className="mobile-nav" aria-label="Navegación principal móvil">{mobilePrimary.map(([label,href])=>navLink(label,href))}<button type="button" className={moreActive?"active":""} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={()=>setMoreOpen(v=>!v)}>Más</button></nav>
    {moreOpen&&<div id="mobile-more-menu" className="mobile-more-menu" role="dialog" aria-label="Más secciones"><div className="mobile-more-head"><strong>Más secciones</strong><button type="button" onClick={()=>setMoreOpen(false)} aria-label="Cerrar menú">×</button></div>{mobileMore.map(([label,href])=>navLink(label,href))}</div>}
    <div className="sidebar-foot" role="status" aria-live="polite"><span className="status-dot" aria-hidden="true"/><span>{status}</span></div>
  </aside>;
}
