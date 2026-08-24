import { APP_VERSION } from "@/lib/app-version";
import { madridToday } from "@/lib/time/madrid";
import { createClient } from "@/lib/supabase/server";
import { asArray, asNumber, asRecord, asString, nullableNumber, nullableString } from "@/lib/validation/json";

export type GoalStatus="on_track"|"attention"|"overdue"|"achieved"|"flexible"|"source_missing";
export type GoalType="savings"|"purchase"|"emergency"|"custom";
export type GoalProgressMode="manual"|"account";
export type GoalPriority="high"|"medium"|"low";
export type GoalAccount={id:string;name:string;role:string;currency:string;balance:number|null;balanceDate:string|null};
export type FinancialGoal={id:string;name:string;type:GoalType;targetAmount:number;progressMode:GoalProgressMode;manualAmount:number;accountId:string|null;accountName:string|null;currentAmount:number|null;progressAmount:number|null;balanceDate:string|null;remainingAmount:number|null;progressPercent:number|null;targetDate:string|null;monthsRemaining:number|null;monthlyRequired:number|null;priority:GoalPriority;status:GoalStatus;notes:string|null;createdAt:string;updatedAt:string};
export type GoalsOverview={version:string;asOf:string;capacityReference:number;capacityReferenceMethod:string;summary:{activeCount:number;targetTotal:number;trackedTotal:number;remainingTotal:number;monthlyRequired:number;achievedCount:number;attentionCount:number;overdueCount:number;sourceMissingCount:number};goals:FinancialGoal[];accounts:GoalAccount[]};

const statusValues:GoalStatus[]=["on_track","attention","overdue","achieved","flexible","source_missing"];
const typeValues:GoalType[]=["savings","purchase","emergency","custom"];
const priorityValues:GoalPriority[]=["high","medium","low"];
const normalizeGoal=(value:unknown):FinancialGoal=>{const raw=asRecord(value);const type=asString(raw.type);const priority=asString(raw.priority);const status=asString(raw.status);return{id:asString(raw.id),name:asString(raw.name,"Objetivo"),type:typeValues.includes(type as GoalType)?type as GoalType:"custom",targetAmount:asNumber(raw.targetAmount),progressMode:asString(raw.progressMode)==="account"?"account":"manual",manualAmount:asNumber(raw.manualAmount),accountId:nullableString(raw.accountId),accountName:nullableString(raw.accountName),currentAmount:nullableNumber(raw.currentAmount),progressAmount:nullableNumber(raw.progressAmount),balanceDate:nullableString(raw.balanceDate),remainingAmount:nullableNumber(raw.remainingAmount),progressPercent:nullableNumber(raw.progressPercent),targetDate:nullableString(raw.targetDate),monthsRemaining:nullableNumber(raw.monthsRemaining),monthlyRequired:nullableNumber(raw.monthlyRequired),priority:priorityValues.includes(priority as GoalPriority)?priority as GoalPriority:"medium",status:statusValues.includes(status as GoalStatus)?status as GoalStatus:"flexible",notes:nullableString(raw.notes),createdAt:asString(raw.createdAt),updatedAt:asString(raw.updatedAt)}};
const normalizeAccount=(value:unknown):GoalAccount=>{const raw=asRecord(value);return{id:asString(raw.id),name:asString(raw.name,"Cuenta"),role:asString(raw.role),currency:asString(raw.currency,"EUR"),balance:nullableNumber(raw.balance),balanceDate:nullableString(raw.balanceDate)}};

export async function getGoalsOverview():Promise<GoalsOverview>{
  const supabase=await createClient();const {data,error}=await supabase.rpc("financial_app_goals");if(error||!data)throw new Error(error?.message||"goals_unavailable");
  const raw=asRecord(data);const summary=asRecord(raw.summary);
  return{version:asString(raw.version,APP_VERSION),asOf:asString(raw.asOf,madridToday()),capacityReference:asNumber(raw.capacityReference),capacityReferenceMethod:asString(raw.capacityReferenceMethod),summary:{activeCount:asNumber(summary.activeCount),targetTotal:asNumber(summary.targetTotal),trackedTotal:asNumber(summary.trackedTotal),remainingTotal:asNumber(summary.remainingTotal),monthlyRequired:asNumber(summary.monthlyRequired),achievedCount:asNumber(summary.achievedCount),attentionCount:asNumber(summary.attentionCount),overdueCount:asNumber(summary.overdueCount),sourceMissingCount:asNumber(summary.sourceMissingCount)},goals:asArray(raw.goals).map(normalizeGoal),accounts:asArray(raw.accounts).map(normalizeAccount)};
}
