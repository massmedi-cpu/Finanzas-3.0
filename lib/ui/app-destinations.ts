import type { FinancialIconName } from "@/components/financial-icons";

export type AppDestinationGroup = "Principal" | "Organizar" | "Planificar" | "Sistema";

export type AppDestination = {
  label:string;
  href:string;
  icon:FinancialIconName;
  group:AppDestinationGroup;
  description:string;
  keywords:readonly string[];
};

export const primaryDestinations = [
  {label:"Inicio",href:"/",icon:"home",group:"Principal",description:"Resumen y estado de tus finanzas",keywords:["portada","resumen","dashboard"]},
  {label:"Cash Flow",href:"/cash-flow",icon:"cash-flow",group:"Principal",description:"Ingresos, gastos y acumulado",keywords:["flujo","caja","dinero"]},
  {label:"Movimientos",href:"/movimientos",icon:"movements",group:"Principal",description:"Buscar, filtrar y editar operaciones",keywords:["transacciones","gastos","ingresos","operaciones"]},
  {label:"Análisis",href:"/analisis",icon:"analysis",group:"Principal",description:"Evolución y concentración del gasto",keywords:["graficas","estadisticas","categorias"]},
  {label:"Previsión",href:"/prevision",icon:"forecast",group:"Principal",description:"Calendario de próximos cargos",keywords:["futuro","calendario","esperados","seguros","impuestos"]},
  {label:"Archivo",href:"/archivo",icon:"archive",group:"Principal",description:"Facturas, tickets y documentos",keywords:["documentos","facturas","tickets","recibos"]},
] as const satisfies readonly AppDestination[];

export const organizeDestinations = [
  {label:"Cuentas",href:"/cuentas",icon:"accounts",group:"Organizar",description:"Saldos y actividad por cuenta",keywords:["bancos","tarjetas","saldo"]},
  {label:"Categorías",href:"/configuracion#categorias",icon:"categories",group:"Organizar",description:"Organiza ingresos y gastos",keywords:["clasificacion","subcategorias"]},
  {label:"Presupuesto",href:"/presupuesto",icon:"budget",group:"Organizar",description:"Límites y consumo mensual",keywords:["limites","gasto","mensual"]},
  {label:"Reglas",href:"/reglas",icon:"rules",group:"Organizar",description:"Automatiza la clasificación",keywords:["automatizacion","clasificar"]},
  {label:"Importación",href:"/configuracion#importacion",icon:"import",group:"Organizar",description:"Origen y actualización de datos",keywords:["drive","excel","sincronizar","actualizar"]},
] as const satisfies readonly AppDestination[];

export const planningDestinations = [
  {label:"Plan",href:"/plan",icon:"plan",group:"Planificar",description:"Visión financiera y decisiones",keywords:["planificacion","estrategia"]},
  {label:"Simulador",href:"/escenarios",icon:"plan",group:"Planificar",description:"Compara escenarios futuros",keywords:["escenarios","simular","proyeccion"]},
  {label:"Objetivos",href:"/objetivos",icon:"goals",group:"Planificar",description:"Metas y progreso de ahorro",keywords:["metas","ahorro"]},
  {label:"Patrimonio",href:"/patrimonio",icon:"net-worth",group:"Planificar",description:"Activos, pasivos y valor neto",keywords:["activos","deudas","valor neto"]},
  {label:"Inteligencia",href:"/inteligencia",icon:"intelligence",group:"Planificar",description:"Señales y oportunidades detectadas",keywords:["alertas","recomendaciones","insights"]},
] as const satisfies readonly AppDestination[];

export const systemDestinations = [
  {label:"OCR",href:"/archivo/revision",icon:"scan",group:"Sistema",description:"Revisa escaneos y asociaciones",keywords:["escaner","tickets","facturas","revision"]},
  {label:"Integraciones",href:"/configuracion#integraciones",icon:"integrations",group:"Sistema",description:"Conexiones y servicios externos",keywords:["google","drive","conexiones"]},
  {label:"Centro de control",href:"/control",icon:"control",group:"Sistema",description:"Integridad, alertas y cierre",keywords:["errores","calidad","conciliacion","mes"]},
  {label:"Explicabilidad",href:"/explicabilidad",icon:"explain",group:"Sistema",description:"Cómo se obtienen los resultados",keywords:["calculos","trazabilidad","origen"]},
  {label:"Configuración",href:"/configuracion",icon:"settings",group:"Sistema",description:"Preferencias de Financial App",keywords:["ajustes","opciones"]},
] as const satisfies readonly AppDestination[];

export const secondaryGroups = [
  {key:"organize",label:"Organizar",items:organizeDestinations},
  {key:"plan",label:"Planificar",items:planningDestinations},
  {key:"system",label:"Sistema",items:systemDestinations},
] as const;

export const secondaryDestinations = [...organizeDestinations,...planningDestinations,...systemDestinations] as const;
export const appDestinations = [...primaryDestinations,...secondaryDestinations] as const;

const initialHrefs = new Set(["/","/movimientos","/prevision","/archivo","/cash-flow","/analisis","/cuentas","/control"]);
export const initialSearchDestinations = appDestinations.filter(item=>initialHrefs.has(item.href));

export function normalizeDestinationSearch(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-ES").trim();
}

export function filterAppDestinations(query:string,limit=8):AppDestination[]{
  const terms=normalizeDestinationSearch(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return initialSearchDestinations.slice(0,limit);
  const matches:{item:AppDestination;score:number}[]=[];
  appDestinations.forEach((item,index)=>{
    const label=normalizeDestinationSearch(item.label);
    const searchable=normalizeDestinationSearch([item.label,item.group,item.description,...item.keywords].join(" "));
    if(!terms.every(term=>searchable.includes(term)))return;
    const score=terms.reduce((total,term)=>total+(label===term?100:label.startsWith(term)?50:label.includes(term)?25:5),0)-index/100;
    matches.push({item,score});
  });
  return matches
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit)
    .map(entry=>entry.item);
}

export function movementSearchHref(query:string){
  const normalized=query.trim();
  return normalized?`/movimientos?search=${encodeURIComponent(normalized)}`:"/movimientos";
}
