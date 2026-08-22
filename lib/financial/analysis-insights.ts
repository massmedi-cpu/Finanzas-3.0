import type { AnalysisMonth, AnalysisOverview } from "@/lib/financial/analysis";

export type AnalysisMonthMarker={month:string;label:string;net:number;expenses:number};
export type AnalysisInsights={
  sampleMonths:number;
  completeMonths:number;
  averageMonthlyIncome:number;
  averageMonthlyExpenses:number;
  averageMonthlyNet:number;
  savingsRatePercent:number|null;
  annualizedExpenses:number|null;
  annualizedNet:number|null;
  expenseVolatilityPercent:number|null;
  recentExpenseTrendPercent:number|null;
  recentNetDelta:number|null;
  top3CategorySharePercent:number;
  topMerchantSharePercent:number|null;
  categorizationRatePercent:number|null;
  bestMonth:AnalysisMonthMarker|null;
  worstMonth:AnalysisMonthMarker|null;
  coverage:"high"|"medium"|"low";
};

const avg=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const percentChange=(current:number,previous:number)=>previous>0?((current-previous)/previous)*100:null;
const round=(value:number,digits=2)=>Number(value.toFixed(digits));

function complete(months:AnalysisMonth[]){return months.filter(month=>month.available&&month.complete&&!month.partial)}

function trendWindows(months:AnalysisMonth[]){
  if(months.length<4)return null;
  const width=Math.min(3,Math.floor(months.length/2));
  if(width<2)return null;
  return {previous:months.slice(-(width*2),-width),recent:months.slice(-width)};
}

export function buildAnalysisInsights(data:AnalysisOverview):AnalysisInsights{
  const available=data.monthly.filter(month=>month.available);
  const completed=complete(data.monthly);
  const baseline=completed.length?completed:available.filter(month=>!month.partial);
  const averageMonthlyIncome=avg(baseline.map(month=>month.income));
  const averageMonthlyExpenses=avg(baseline.map(month=>month.expenses));
  const averageMonthlyNet=avg(baseline.map(month=>month.net));
  const savingsRatePercent=averageMonthlyIncome>0?round((averageMonthlyNet/averageMonthlyIncome)*100,1):null;
  const annualizedExpenses=baseline.length?round(averageMonthlyExpenses*12):null;
  const annualizedNet=baseline.length?round(averageMonthlyNet*12):null;

  let expenseVolatilityPercent:number|null=null;
  if(baseline.length>=2&&averageMonthlyExpenses>0){
    const variance=avg(baseline.map(month=>(month.expenses-averageMonthlyExpenses)**2));
    expenseVolatilityPercent=round((Math.sqrt(variance)/averageMonthlyExpenses)*100,1);
  }

  const windows=trendWindows(completed);
  const previousExpenses=windows?avg(windows.previous.map(month=>month.expenses)):0;
  const recentExpenses=windows?avg(windows.recent.map(month=>month.expenses)):0;
  const recentExpenseTrendPercent=windows?percentChange(recentExpenses,previousExpenses):null;
  const recentNetDelta=windows?round(avg(windows.recent.map(month=>month.net))-avg(windows.previous.map(month=>month.net))):null;

  const best=completed.length?[...completed].sort((a,b)=>b.net-a.net)[0]:null;
  const worst=completed.length?[...completed].sort((a,b)=>a.net-b.net)[0]:null;
  const top3CategorySharePercent=round(data.categories.slice(0,3).reduce((sum,category)=>sum+category.share,0),1);
  const topMerchantSharePercent=data.expenses>0&&data.merchants.length?round((data.merchants[0].amount/data.expenses)*100,1):null;
  const categorizationRatePercent=data.expenses>0?round(Math.max(0,100-(data.uncategorizedAmount/data.expenses)*100),1):null;
  const coverage:AnalysisInsights["coverage"]=completed.length>=6?"high":completed.length>=3?"medium":"low";

  const marker=(month:AnalysisMonth|null):AnalysisMonthMarker|null=>month?{month:month.month,label:month.label,net:month.net,expenses:month.expenses}:null;
  return {
    sampleMonths:baseline.length,
    completeMonths:completed.length,
    averageMonthlyIncome:round(averageMonthlyIncome),
    averageMonthlyExpenses:round(averageMonthlyExpenses),
    averageMonthlyNet:round(averageMonthlyNet),
    savingsRatePercent,
    annualizedExpenses,
    annualizedNet,
    expenseVolatilityPercent,
    recentExpenseTrendPercent:recentExpenseTrendPercent==null?null:round(recentExpenseTrendPercent,1),
    recentNetDelta,
    top3CategorySharePercent,
    topMerchantSharePercent,
    categorizationRatePercent,
    bestMonth:marker(best),
    worstMonth:marker(worst),
    coverage,
  };
}
