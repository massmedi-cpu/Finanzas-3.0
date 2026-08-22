import type { PlanOverview } from "@/lib/financial/plan";

export type HorizonMonths=3|6|12;
export type HorizonPoint={months:HorizonMonths;capacityReference:number;goalCommitment:number;residualCapacity:number};
export type LongHorizon={
  month:string;
  asOf:string;
  monthlyCapacityReference:number;
  monthlyGoalCommitment:number;
  monthlyResidualCapacity:number;
  points:HorizonPoint[];
  goalRemaining:number;
  goalFundingMonths:number|null;
  sustainability:"positive"|"strained"|"no_goals";
  liquidityBoundary:{days:90;currentBalance:number;projectedBalance90:number;lowestBalance90:number;firstNegativeDate:string|null};
  netWorthBoundary:{days:90;currentNetWorth:number;projectedNetWorth90:number};
  method:{capacityReference:string;linearPlanningOnly:true;bankBalanceForecastLimitedTo90Days:true;netWorthProjectionLimitedTo90Days:true};
};

const round=(value:number)=>Number(value.toFixed(2));

export function buildLongHorizon(plan:PlanOverview):LongHorizon{
  const monthlyCapacityReference=plan.summary.goalCapacityReference;
  const monthlyGoalCommitment=plan.summary.goalMonthlyRequired;
  const monthlyResidualCapacity=plan.summary.capacityAfterGoals;
  const months:HorizonMonths[]=[3,6,12];
  const points=months.map(month=>({
    months:month,
    capacityReference:round(monthlyCapacityReference*month),
    goalCommitment:round(monthlyGoalCommitment*month),
    residualCapacity:round(monthlyResidualCapacity*month),
  }));
  const goalRemaining=plan.domains.goals.summary.remainingTotal;
  const goalFundingMonths=goalRemaining>0&&monthlyGoalCommitment>0?round(goalRemaining/monthlyGoalCommitment):null;
  const sustainability:LongHorizon["sustainability"]=plan.domains.goals.summary.activeCount===0?"no_goals":monthlyResidualCapacity>=0?"positive":"strained";
  const forecast=plan.domains.forecast;
  const netWorth=plan.domains.netWorth;
  return {
    month:plan.month,
    asOf:plan.asOf,
    monthlyCapacityReference:round(monthlyCapacityReference),
    monthlyGoalCommitment:round(monthlyGoalCommitment),
    monthlyResidualCapacity:round(monthlyResidualCapacity),
    points,
    goalRemaining:round(goalRemaining),
    goalFundingMonths,
    sustainability,
    liquidityBoundary:{days:90,currentBalance:forecast.currentBalance,projectedBalance90:forecast.projectedBalance,lowestBalance90:forecast.lowestBalance,firstNegativeDate:forecast.firstNegativeDate},
    netWorthBoundary:{days:90,currentNetWorth:netWorth.netWorth,projectedNetWorth90:netWorth.projectedNetWorth90},
    method:{capacityReference:plan.rules.goalCapacityMethod,linearPlanningOnly:true,bankBalanceForecastLimitedTo90Days:true,netWorthProjectionLimitedTo90Days:true},
  };
}
