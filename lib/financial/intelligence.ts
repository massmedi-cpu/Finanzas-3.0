import { formatEuroInteger, formatInteger, formatSignedPercent } from "@/lib/format/es-es";
import type { AnalysisInsights } from "@/lib/financial/analysis-insights";
import type { PlanOverview, PlanSeverity } from "@/lib/financial/plan";

export type IntelligencePosture="defensive"|"constrained"|"balanced"|"opportunity";
export type IntelligenceConfidence="high"|"medium"|"low";
export type IntelligenceSignal={key:string;severity:PlanSeverity;kind:"risk"|"quality"|"opportunity"|"context";title:string;detail:string;href:string;sourcePath:string};
export type DecisionIntelligence={posture:IntelligencePosture;headline:string;detail:string;confidence:IntelligenceConfidence;confidenceReasons:string[];signals:IntelligenceSignal[]};

const priority:Record<PlanSeverity,number>={critical:0,high:1,medium:2,low:3};

function confidence(plan:PlanOverview):{level:IntelligenceConfidence;reasons:string[]}{
  const c=plan.domains.control.snapshot;
  const coverage=plan.domains.netWorth.coverage;
  const reasons:string[]=[];
  if(c.duplicates>0)reasons.push(`${formatInteger(c.duplicates)} posibles duplicados`);
  if(c.closeBlockers>0)reasons.push(`${formatInteger(c.closeBlockers)} bloqueos de cierre`);
  if(!coverage.currentComplete)reasons.push(`patrimonio con cobertura ${formatInteger(coverage.knownAccounts)}/${formatInteger(coverage.accountCount)}`);
  if(c.needsReview>0)reasons.push(`${formatInteger(c.needsReview)} movimientos por revisar`);
  if(c.unreconciled>0)reasons.push(`${formatInteger(c.unreconciled)} movimientos sin conciliar`);
  if(c.unbudgetedSpent>0)reasons.push(`${formatEuroInteger(c.unbudgetedSpent)} sin presupuesto`);
  const low=c.duplicates>0||c.closeBlockers>0||!coverage.currentComplete;
  const medium=!low&&(c.needsReview>0||c.unreconciled>0||c.unbudgetedSpent>0);
  return {level:low?"low":medium?"medium":"high",reasons};
}

export function buildDecisionIntelligence(plan:PlanOverview,analytics?:AnalysisInsights|null):DecisionIntelligence{
  const s=plan.summary;const d=plan.domains;const c=d.control.snapshot;
  const signals:IntelligenceSignal[]=[];
  const add=(signal:IntelligenceSignal)=>signals.push(signal);
  if(d.forecast.firstNegativeDate)add({key:"liquidity-negative",severity:"critical",kind:"risk",title:"La liquidez entra en negativo",detail:`La previsión confirmada detecta saldo negativo a partir del ${d.forecast.firstNegativeDate}.`,href:d.forecast.href,sourcePath:"forecast.firstNegativeDate"});
  if(s.monthlyNet<0&&s.forecastProjectedNet90<0)add({key:"deficit-persists",severity:"high",kind:"risk",title:"El déficit del mes también aparece a 90 días",detail:`El mes va en ${formatEuroInteger(s.monthlyNet)} y la previsión acumula ${formatEuroInteger(s.forecastProjectedNet90)}.`,href:d.forecast.href,sourcePath:"summary.monthlyNet + summary.forecastProjectedNet90"});
  if(s.budgetProjectedDifference!=null&&s.budgetProjectedDifference<0)add({key:"budget-projection-negative",severity:"high",kind:"risk",title:"El presupuesto proyecta exceso",detail:`Manteniendo el ritmo actual, la diferencia proyectada es ${formatEuroInteger(s.budgetProjectedDifference)}.`,href:d.budget.href,sourcePath:"summary.budgetProjectedDifference"});
  if(s.capacityAfterGoals<0)add({key:"goals-over-capacity",severity:"high",kind:"risk",title:"Los objetivos exigen más que tu capacidad de referencia",detail:`Faltan ${formatEuroInteger(Math.abs(s.capacityAfterGoals))} al mes para cubrir el esfuerzo requerido con la capacidad calculada.`,href:d.goals.href,sourcePath:"summary.capacityAfterGoals"});
  if(c.closeBlockers>0)add({key:"close-blockers",severity:"high",kind:"quality",title:"El cierre mensual sigue bloqueado",detail:`Hay ${formatInteger(c.closeBlockers)} condiciones que deben resolverse antes de considerar el mes cerrado.`,href:d.control.href,sourcePath:"domains.control.snapshot.closeBlockers"});
  if(!d.netWorth.coverage.currentComplete)add({key:"net-worth-coverage",severity:"medium",kind:"quality",title:"El patrimonio no tiene cobertura completa",detail:`Hay saldo conocido en ${formatInteger(d.netWorth.coverage.knownAccounts)} de ${formatInteger(d.netWorth.coverage.accountCount)} cuentas.`,href:d.netWorth.href,sourcePath:"domains.netWorth.coverage"});
  if(analytics?.recentExpenseTrendPercent!=null){const trend=analytics.recentExpenseTrendPercent;add({key:"expense-trend",severity:trend>0&&s.monthlyNet<0?"medium":"low",kind:"context",title:trend>0?"El gasto reciente está subiendo":"El gasto reciente está bajando",detail:`La media del último bloque de meses completos cambia ${formatSignedPercent(trend,1)} frente al bloque comparable anterior.`,href:"/analisis",sourcePath:"analysis.recentExpenseTrendPercent"})}
  if(!signals.some(signal=>signal.severity==="critical"||signal.severity==="high")&&s.capacityAfterGoals>0&&s.monthlyNet>0&&d.forecast.lowestBalance>=0)add({key:"available-capacity",severity:"low",kind:"opportunity",title:"Hay margen positivo después de objetivos",detail:`La capacidad de referencia deja ${formatEuroInteger(s.capacityAfterGoals)} al mes tras cubrir el esfuerzo de objetivos.`,href:"/plan",sourcePath:"summary.capacityAfterGoals"});
  signals.sort((a,b)=>priority[a.severity]-priority[b.severity]||a.key.localeCompare(b.key));
  const hasCritical=signals.some(signal=>signal.severity==="critical");
  const hasHigh=signals.some(signal=>signal.severity==="high");
  const posture:IntelligencePosture=hasCritical||(s.monthlyNet<0&&s.forecastProjectedNet90<0)?"defensive":hasHigh||s.capacityAfterGoals<0?"constrained":s.monthlyNet>0&&s.capacityAfterGoals>0&&d.forecast.lowestBalance>=0?"opportunity":"balanced";
  const copy={defensive:{headline:"Protege liquidez y corrige bloqueos antes de ampliar compromisos",detail:"Hay señales simultáneas que aconsejan priorizar estabilidad de caja y calidad de datos."},constrained:{headline:"El plan es viable, pero tiene una tensión concreta que resolver",detail:"La siguiente mejora debe concentrarse en el dominio que está consumiendo margen o bloqueando el cierre."},balanced:{headline:"El plan está equilibrado sin margen claro para acelerar",detail:"No hay una señal dominante. Mantén la disciplina actual y revisa los indicadores cuando cambie el mes."},opportunity:{headline:"Hay margen para avanzar sin deteriorar la liquidez prevista",detail:"El resultado, la capacidad tras objetivos y el mínimo previsto no muestran tensión inmediata."}}[posture];
  const conf=confidence(plan);
  return {posture,headline:copy.headline,detail:copy.detail,confidence:conf.level,confidenceReasons:conf.reasons,signals:signals.slice(0,5)};
}
