export type ClassificationOrigin="source"|"rule"|"manual"|"split";

export type ClassificationOriginInput={
  splitCount:number;
  categoryOverride:string|null;
  subcategoryOverride:string|null;
  counterpartyOverride:string|null;
  ruleControlsCategory:boolean;
  ruleControlsSubcategory:boolean;
};

export type ClassificationOriginResult={origin:ClassificationOrigin;label:string;detail:string;priority:number};

export const CLASSIFICATION_PRECEDENCE:readonly ClassificationOriginResult[]=[
  {origin:"split",label:"División manual",detail:"Las partes del movimiento mandan sobre la clasificación completa.",priority:1},
  {origin:"manual",label:"Ajuste manual",detail:"Una edición privada del usuario manda sobre cualquier regla.",priority:2},
  {origin:"rule",label:"Regla automática",detail:"Una regla privada actúa solo cuando no existe una edición manual protegida.",priority:3},
  {origin:"source",label:"Fuente bancaria",detail:"Se usa cuando no existe ninguna clasificación privada con mayor prioridad.",priority:4},
] as const;

const byOrigin=(origin:ClassificationOrigin)=>CLASSIFICATION_PRECEDENCE.find(item=>item.origin===origin)!;

export function resolveClassificationOrigin(input:ClassificationOriginInput):ClassificationOriginResult{
  if(input.splitCount>0)return byOrigin("split");
  const manualCategory=input.categoryOverride!==null&&!input.ruleControlsCategory;
  const manualSubcategory=input.subcategoryOverride!==null&&!input.ruleControlsSubcategory;
  if(manualCategory||manualSubcategory||input.counterpartyOverride!==null)return byOrigin("manual");
  if(input.ruleControlsCategory||input.ruleControlsSubcategory)return byOrigin("rule");
  return byOrigin("source");
}
