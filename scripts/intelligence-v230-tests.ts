import assert from "node:assert/strict";
import { buildDecisionIntelligence } from "../lib/financial/intelligence";
import { normalizeFinancialPlan } from "../lib/financial/plan";

function plan(overrides:any={}){
  const raw={
    version:"2.3.0",asOf:"2026-08-22",month:"2026-08",status:"stable",
    summary:{monthlyIncome:2500,monthlyExpenses:1800,monthlyNet:700,budgetAssigned:1800,budgetSpent:1200,budgetAvailable:600,budgetProjectedDifference:200,forecastCurrentBalance:3000,forecastProjectedBalance90:3600,forecastLowestBalance90:2200,forecastProjectedNet90:600,netWorth:10000,projectedNetWorth90:10600,goalMonthlyRequired:200,goalCapacityReference:700,capacityAfterGoals:500},
    domains:{
      budget:{assigned:1800,spent:1200,available:600,overBudgetCount:0,unbudgetedSpent:0,projection:{projectedSpent:1600,projectedDifference:200,method:"pace"},href:"/presupuesto"},
      forecast:{currentBalance:3000,projectedBalance:3600,projectedNet:600,lowestBalance:2200,firstNegativeDate:null,eventCount:4,suggestionCount:0,href:"/prevision"},
      goals:{capacityReference:700,capacityReferenceMethod:"three_complete_months",summary:{activeCount:1,targetTotal:5000,trackedTotal:1000,remainingTotal:4000,monthlyRequired:200,achievedCount:0,attentionCount:0,overdueCount:0,sourceMissingCount:0},href:"/objetivos"},
      netWorth:{assets:10000,liabilities:0,netWorth:10000,projectedNetWorth90:10600,forecastImpact90:600,coverage:{knownAccounts:2,accountCount:2,currentComplete:true},href:"/patrimonio"},
      control:{snapshot:{income:2500,expenses:1800,net:700,needsReview:0,duplicates:0,unreconciled:0,overBudgetCount:0,unbudgetedSpent:0,closeBlockers:0,closeWarnings:0,closeReady:true},visibleAlertCount:0,hiddenAlertCount:0,href:"/control"},
    },
    actions:[],actionSummary:{total:0,critical:0,high:0,medium:0},rules:{readOnlyDecisionLayer:true,noAutomaticFinancialMutations:true,forecastDays:90,forecastSuggestionsAffectProjection:false,goalCapacityMethod:"three_complete_months",sourceFunctions:[]},
  };
  const merged={...raw,...overrides,summary:{...raw.summary,...overrides.summary},domains:{...raw.domains,...overrides.domains}};
  return normalizeFinancialPlan(merged);
}

const opportunity=buildDecisionIntelligence(plan());
assert.equal(opportunity.posture,"opportunity");
assert.equal(opportunity.confidence,"high");
assert.ok(opportunity.signals.some(signal=>signal.key==="available-capacity"));

const defensivePlan=plan({
  summary:{monthlyNet:-150,forecastProjectedNet90:-500,budgetProjectedDifference:-120,capacityAfterGoals:-80},
  domains:{
    forecast:{currentBalance:500,projectedBalance:-100,projectedNet:-500,lowestBalance:-150,firstNegativeDate:"2026-09-10",eventCount:8,suggestionCount:0,href:"/prevision"},
    budget:{assigned:1800,spent:1700,available:100,overBudgetCount:1,unbudgetedSpent:0,projection:{projectedSpent:1920,projectedDifference:-120,method:"pace"},href:"/presupuesto"},
  },
});
const defensive=buildDecisionIntelligence(defensivePlan);
assert.equal(defensive.posture,"defensive");
assert.equal(defensive.signals[0].severity,"critical");
assert.ok(defensive.signals.some(signal=>signal.key==="deficit-persists"));
assert.ok(defensive.signals.some(signal=>signal.key==="budget-projection-negative"));
assert.ok(defensive.signals.some(signal=>signal.key==="goals-over-capacity"));

const lowConfidence=buildDecisionIntelligence(plan({domains:{
  netWorth:{assets:10000,liabilities:0,netWorth:10000,projectedNetWorth90:10600,forecastImpact90:600,coverage:{knownAccounts:1,accountCount:2,currentComplete:false},href:"/patrimonio"},
  control:{snapshot:{income:2500,expenses:1800,net:700,needsReview:2,duplicates:1,unreconciled:0,overBudgetCount:0,unbudgetedSpent:0,closeBlockers:0,closeWarnings:0,closeReady:false},visibleAlertCount:1,hiddenAlertCount:0,href:"/control"},
}}));
assert.equal(lowConfidence.confidence,"low");
assert.ok(lowConfidence.confidenceReasons.some(reason=>reason.includes("duplicados")));
assert.ok(lowConfidence.signals.some(signal=>signal.key==="net-worth-coverage"));

const withAnalytics=buildDecisionIntelligence(plan(),{recentExpenseTrendPercent:8} as any);
assert.ok(withAnalytics.signals.some(signal=>signal.key==="expense-trend"));

console.log("Financial App 2.3 intelligence tests OK · postura, calidad, riesgos y oportunidades explicables");
