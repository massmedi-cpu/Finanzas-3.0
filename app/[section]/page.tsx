import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthorizedUser } from "@/lib/auth/require-user";

const sections: Record<string,{title:string;description:string;items:string[]}> = {
  cuentas:{title:"Cuentas",description:"Saldos, evolución y detalle de cada producto financiero.",items:["Cuenta corriente Openbank · 3967","Cuenta ahorro Openbank · 2504","Arquitectura preparada para nuevas cuentas y productos"]},
  movimientos:{title:"Movimientos",description:"Control, búsqueda, edición y trazabilidad completa de operaciones.",items:["Datos de origen preservados","Campos editables separados del origen","Historial y revisión de cambios"]},
  "cash-flow":{title:"Cash Flow",description:"Ingresos reales computables menos gastos reales computables.",items:["Cuenta ahorro excluida siempre","Traspasos entre cuentas excluidos","Duplicados y exclusiones explícitas fuera del cálculo"]},
  presupuesto:{title:"Presupuesto",description:"Límites y objetivos de gasto por categoría y periodo.",items:["Mensual, trimestral, anual o personalizado","Seguimiento del disponible","Previsión de cierre"]},
  prevision:{title:"Previsión",description:"Calendario financiero y proyección de dinero futuro.",items:["Recurrencias","Confianza y explicación de predicciones","Consolidación con movimientos reales"]},
  patrimonio:{title:"Patrimonio",description:"Evolución del patrimonio financiero actual y futuro.",items:["Cuenta corriente","Cuenta ahorro","Base extensible a inversiones, deudas y otros activos"]},
  analisis:{title:"Análisis",description:"Panel configurable de tendencias, comparativas y desviaciones.",items:["Ingresos y gastos","Categorías y comercios","Comparativas interanuales y tendencias"]},
  archivo:{title:"Archivo",description:"Repositorio documental financiero con OCR y asociaciones.",items:["PDF e imágenes","OCR indexable","Vinculación con movimientos"]},
  configuracion:{title:"Configuración",description:"Aplicación, datos, cuenta, apariencia, preferencias y sistema.",items:["Versión 0.1.0","Google OAuth como único acceso","Fuente Google Sheets solo lectura"]},
};

export const dynamic = "force-dynamic";

export default async function SectionPage({params}:{params:Promise<{section:string}>}){
  await requireAuthorizedUser();
  const {section}=await params;
  const data=sections[section];
  if(!data) notFound();
  return <main className="section-page"><Link href="/">← Volver a Inicio</Link><h1>{data.title}</h1><p>{data.description}</p><article className="section-card"><h2>Base funcional definida</h2><ul>{data.items.map(item=><li key={item}>{item}</li>)}</ul><p>Esta sección se conectará progresivamente al núcleo de datos sin modificar las reglas ya validadas.</p>{section==="configuracion"&&<form action="/auth/signout" method="post"><button className="signout-button" type="submit">Cerrar sesión</button></form>}</article></main>;
}
