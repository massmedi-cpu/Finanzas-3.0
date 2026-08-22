import assert from "node:assert/strict";
import { buildLongHorizon } from "../lib/financial/long-horizon";
import { normalizeFinancialPlan } from "../lib/financial/plan";

function makePlan(overrides:any={}){
  const raw={
    version:"2.4.0",asOf:"2026-08-22",month:"2026-08",status:"stable",
    summary:{monthlyIncome:2500,monthlyExpenses:1800,monthlyNet:700,budgetAssigned:1800,budgetSpent:1200,budgetAvailable:600,budgetProjectedDifference:200,forecastCurrentBalance:3000,forecastProjectedBalance90:3600,forecastLowestBalance90:2200,forecastProjectedNet90:600,netWorth:10000,projectedNetWorth90:10600,goalMonthlyRequired:200,goalCapacityReference:700,capacityAfterGoals:500},
    domains:{
      budget:{assigned:1800,spent:1200,available:600,overBudgetCount:0,unbudgetedSpent:0,projection:{projectedSpent:1600,projectedDifference:200,method:"pace"},href:"/presupuesto"},
      forecast:{currentBalance:3000,projectedBalance:3600,projectedNet:600,lowestBalance:2200,firstNegativeDate:null,eventCount:4,suggestionCount:0,href:"/prevision"},
      goals:{capacityReference:700,capacityReferenceMethod:"three_complete_months",summary:{activeCount:2,targetTotal:7000,trackedTotal:2200,remainingTotal:4800,monthlyRequired:200,achievedCount:0,attentionCount:0,overdueCount:0,sourceMissingCount:0},href:"/objetivos"},
      netWorth:{assets:10000,liabilities:0,netWorth:10000,projectedNetWorth90:10600,forecastImpact90:600,coverage:{knownAccounts:2,accountCount:2,currentComplete:true},href:"/patrimonio"},
      control:{snapshot:{income:2500,expenses:1800,net:700,needsReview:0,duplicates:0,unreconciled:0,overBudgetCount:0,unbudgetedSpent:0,closeBlockers:0,closeWarnings:0,closeReady:true},visibleAlertCount:0,hiddenAlertCount:0,href:"/control"},
    },
    actions:[],actionSummary:{total:0,critical:0,high:0,medium:0},rules:{readOnlyDecisionLayer:true,noAutomaticFinancialMutations:true,forecastDays:90,forecastSuggestionsAffectProjection:false,goalCapacityMethod:"three_complete_months",sourceFunctions:[]},
  };
  return normalizeFinancialPlan({...raw,...overrides,summary:{...raw.summary,...overrides.summary},domains:{...raw.domains,...overrides.domains}});
}

const positive=buildLongHorizon(makePlan());
assert.equal(positive.sustainability,"positive");
assert.deepEqual(positive.points.map(point=>point.months),[3,6,12]);
assert.deepEqual(positive.points.map(point=>point.capacityReference),[2100,4200,8400]);
assert.deepEqual(positive.points.map(point=>point.goalCommitment),[600,1200,2400]);
assert.deepEqual(positive.points.map(point=>point.residualCapacity),[1500,3000,6000]);
assert.equal(positive.goalFundingMonths,24);
assert.equal(positive.liquidityBoundary.days,90);
assert.equal(positive.liquidityBoundary.projectedBalance90,3600);
assert.equal(positive.netWorthBoundary.days,90);
assert.equal(positive.netWorthBoundary.projectedNetWorth90,10600);
assert.equal(positive.method.linearPlanningOnly,true);
assert.equal(positive.method.bankBalanceForecastLimitedTo90Days,true);
assert.equal(positive.method.netWorthProjectionLimitedTo90Days,true);

const strained=buildLongHorizon(makePlan({summary:{goalMonthlyRequired:900,goalCapacityReference:700,capacityAfterGoals:-200}}));
assert.equal(strained.sustainability,"strained");
assert.deepEqual(strained.points.map(point=>point.residualCapacity),[-600,-1200,-2400]);

const noGoals=buildLongHorizon(makePlan({summary:{goalMonthlyRequired:0,capacityAfterGoals:700},domains:{goals:{capacityReference:700,capacityReferenceMethod:"three_complete_months",summary:{activeCount:0,targetTotal:0,trackedTotal:0,remainingTotal:0,monthlyRequired:0,achievedCount:0,attentionCount:0,overdueCount:0,sourceMissingCount:0},href:"/objetivos"}}}));
assert.equal(noGoals.sustainability,"no_goals");
assert.equal(noGoals.goalFundingMonths,null);
assert.equal(noGoals.goalRemaining,0);

const boundary=buildLongHorizon(makePlan({domains:{forecast:{currentBalance:500,projectedBalance:-100,projectedNet:-600,lowestBalance:-150,firstNegativeDate:"2026-09-10",eventCount:8,suggestionCount:0,href:"/prevision"}}}));
assert.equal(boundary.liquidityBoundary.firstNegativeDate,"2026-09-10");
assert.equal(boundary.liquidityBoundary.lowestBalance90,-150);
assert.equal("projectedBalance180" in boundary.liquidityBoundary,false);
assert.equal("projectedBalance365" in boundary.liquidityBoundary,false);
assert.equal("projectedNetWorth365" in boundary.netWorthBoundary,false);

console.log("Financial App 2.4 long-horizon tests OK · capacidad 3/6/12 y límites de previsión 90 días protegidos");
