import { notFound } from "next/navigation";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { AppSidebar } from "@/components/app-sidebar";

const sections: Record<string,{title:string;description:string;items:string[];href:string}> = {
  analisis:{title:"Análisis",href:"/analisis",description:"Panel configurable de tendencias, comparativas y desviaciones.",items:["Ingresos y gastos","Categorías y comercios","Comparativas interanuales y tendencias"]},
  archivo:{title:"Archivo",href:"/archivo",description:"Repositorio documental financiero con OCR y asociaciones.",items:["PDF e imágenes","OCR indexable","Vinculación con movimientos"]},
  configuracion:{title:"Configuración",href:"/configuracion",description:"Aplicación, datos, cuenta, apariencia, preferencias y sistema.",items:["Versión 0.8.0","Google OAuth como único acceso","Fuente Google Drive XLSX solo lectura"]},
};
export const dynamic="force-dynamic";
export default async function SectionPage({params}:{params:Promise<{section:string}>}){
  await requireAuthorizedUser(); const {section}=await params; const data=sections[section]; if(!data) notFound();
  return <main className="app-shell"><AppSidebar active={data.href}/><section className="workspace section-workspace"><header className="topbar"><div><p className="eyebrow">{data.title.toUpperCase()} · 0.8.0</p><h1>{data.title}</h1><p>{data.description}</p></div></header><article className="section-card"><h2>Base funcional definida</h2><ul>{data.items.map(item=><li key={item}>{item}</li>)}</ul><p>Esta sección se conectará progresivamente al núcleo de datos sin modificar las reglas ya validadas.</p>{section==="configuracion"&&<form action="/auth/signout" method="post"><button className="signout-button" type="submit">Cerrar sesión</button></form>}</article></section></main>;
}
