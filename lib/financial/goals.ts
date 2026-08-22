import { createClient } from "@/lib/supabase/server";

export type GoalStatus="on_track"|"attention"|"overdue"|"achieved"|"flexible"|"source_missing";
export type GoalType="savings"|"purchase"|"emergency"|"custom";
export type GoalProgressMode="manual"|"account";
export type GoalPriority="high"|"medium"|"low";

export type GoalAccount={id:string;name:string;role:string;currency:string;balance:number|null;balanceDate:string|null};
export type FinancialGoal={
  id:string;name:string;type:GoalType;targetAmount:number;progressMode:GoalProgressMode;manualAmount:number;
  accountId:string|null;accountName:string|null;currentAmount:number|null;progressAmount:number|null;balanceDate:string|null;
  remainingAmount:number|null;progressPercent:number|null;targetDate:string|null;monthsRemaining:number|null;monthlyRequired:number|null;
  priority:GoalPriority;status:GoalStatus;notes:string|null;createdAt:string;updatedAt:string;
};
export type GoalsOverview={
  version:string;asOf:string;capacityReference:number;capacityReferenceMethod:string;
  summary:{activeCount:number;targetTotal:number;trackedTotal:number;remainingTotal:number;monthlyRequired:number;achievedCount:number;attentionCount:number;overdueCount:number;sourceMissingCount:number};
  goals:FinancialGoal[];accounts:GoalAccount[];
};

const asNumber=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullableNumber=(value:unknown)=>value==null?null:asNumber(value);
const statusValues:GoalStatus[]=["on_track","attention","overdue","achieved","flexible","source_missing"];
const typeValues:GoalType[]=["savings","purchase","emergency","custom"];
const priorityValues:GoalPriority[]=["high","medium","low"];

function normalizeGoal(raw:any):FinancialGoal{
  return {
    id:String(raw.id||""),name:String(raw.name||"Objetivo"),type:typeValues.includes(raw.type)?raw.type:"custom",targetAmount:asNumber(raw.targetAmount),
    progressMode:raw.progressMode==="account"?"account":"manual",manualAmount:asNumber(raw.manualAmount),accountId:raw.accountId||null,accountName:raw.accountName||null,
    currentAmount:nullableNumber(raw.currentAmount),progressAmount:nullableNumber(raw.progressAmount),balanceDate:raw.balanceDate||null,remainingAmount:nullableNumber(raw.remainingAmount),
    progressPercent:nullableNumber(raw.progressPercent),targetDate:raw.targetDate||null,monthsRemaining:raw.monthsRemaining==null?null:asNumber(raw.monthsRemaining),monthlyRequired:nullableNumber(raw.monthlyRequired),
    priority:priorityValues.includes(raw.priority)?raw.priority:"medium",status:statusValues.includes(raw.status)?raw.status:"flexible",notes:raw.notes||null,
    createdAt:String(raw.createdAt||""),updatedAt:String(raw.updatedAt||""),
  };
}

export async function getGoalsOverview():Promise<GoalsOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_goals");
  if(error||!data)throw new Error(error?.message||"goals_unavailable");
  const raw=data as any;const summary=raw.summary||{};
  return {
    version:String(raw.version||"1.0.0-rc.1"),asOf:String(raw.asOf||new Date().toISOString().slice(0,10)),capacityReference:asNumber(raw.capacityReference),capacityReferenceMethod:String(raw.capacityReferenceMethod||""),
    summary:{activeCount:asNumber(summary.activeCount),targetTotal:asNumber(summary.targetTotal),trackedTotal:asNumber(summary.trackedTotal),remainingTotal:asNumber(summary.remainingTotal),monthlyRequired:asNumber(summary.monthlyRequired),achievedCount:asNumber(summary.achievedCount),attentionCount:asNumber(summary.attentionCount),overdueCount:asNumber(summary.overdueCount),sourceMissingCount:asNumber(summary.sourceMissingCount)},
    goals:Array.isArray(raw.goals)?raw.goals.map(normalizeGoal):[],
    accounts:Array.isArray(raw.accounts)?raw.accounts.map((a:any)=>({id:String(a.id||""),name:String(a.name||"Cuenta"),role:String(a.role||""),currency:String(a.currency||"EUR"),balance:nullableNumber(a.balance),balanceDate:a.balanceDate||null})):[],
  };
}
