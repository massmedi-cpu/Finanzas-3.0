import assert from "node:assert/strict";
import { buildAnalysisInsights } from "../lib/financial/analysis-insights";
import type { AnalysisOverview } from "../lib/financial/analysis";

const base:AnalysisOverview={
  version:"2.1.0",year:2026,periodStart:"2026-01-01",periodEnd:"2026-07-15",comparisonYear:2025,comparisonPeriodEnd:"2025-07-15",
  income:13000,expenses:9900,net:3100,movements:120,priorIncome:0,priorExpenses:0,priorNet:0,priorMovements:0,
  incomeChangePercent:null,expenseChangePercent:null,netChange:0,uncategorizedCount:1,uncategorizedAmount:99,
  monthly:[
    {month:"2026-01",label:"Ene",income:2000,expenses:1000,net:1000,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-02",label:"Feb",income:2000,expenses:1200,net:800,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-03",label:"Mar",income:2000,expenses:1400,net:600,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-04",label:"Abr",income:2000,expenses:1600,net:400,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-05",label:"May",income:2000,expenses:1800,net:200,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-06",label:"Jun",income:2000,expenses:2000,net:0,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:false,complete:true},
    {month:"2026-07",label:"Jul",income:1000,expenses:900,net:100,priorIncome:null,priorExpenses:null,priorNet:null,available:true,partial:true,complete:false},
  ],
  categories:[
    {category:"Vivienda",amount:3960,movements:12,share:40},
    {category:"Alimentación",amount:2475,movements:30,share:25},
    {category:"Transporte",amount:1485,movements:18,share:15},
  ],
  merchants:[{merchant:"Principal",amount:3000,movements:20}],deviations:[],years:[2025,2026],
  rules:{samePeriodComparison:true,partialMonthUsesSameElapsedDays:true,excludeSavings:true,excludeInternalTransfers:true,excludeDuplicates:true,respectCashFlowOverride:true},
};

const result=buildAnalysisInsights(base);
assert.equal(result.sampleMonths,6);
assert.equal(result.completeMonths,6);
assert.equal(result.averageMonthlyIncome,2000);
assert.equal(result.averageMonthlyExpenses,1500);
assert.equal(result.averageMonthlyNet,500);
assert.equal(result.savingsRatePercent,25);
assert.equal(result.annualizedExpenses,18000);
assert.equal(result.annualizedNet,6000);
assert.equal(result.expenseVolatilityPercent,22.8);
assert.equal(result.recentExpenseTrendPercent,50);
assert.equal(result.recentNetDelta,-600);
assert.equal(result.top3CategorySharePercent,80);
assert.equal(result.topMerchantSharePercent,30.3);
assert.equal(result.categorizationRatePercent,99);
assert.equal(result.bestMonth?.month,"2026-01");
assert.equal(result.worstMonth?.month,"2026-06");
assert.equal(result.coverage,"high");

const partialOnly=buildAnalysisInsights({...base,expenses:900,uncategorizedAmount:0,categories:[],merchants:[],monthly:[base.monthly[6]]});
assert.equal(partialOnly.sampleMonths,0);
assert.equal(partialOnly.annualizedExpenses,null);
assert.equal(partialOnly.expenseVolatilityPercent,null);
assert.equal(partialOnly.bestMonth,null);
assert.equal(partialOnly.coverage,"low");

console.log("Financial App 2.2 analytics tests OK · meses parciales excluidos y métricas derivadas estables");
