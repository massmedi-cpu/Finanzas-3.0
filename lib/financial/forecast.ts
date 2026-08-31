import { getForecastLiquidity } from "@/lib/financial/forecast-liquidity";

export type ForecastRecurrence={frequency:"weekly"|"monthly"|"yearly";interval:number;until?:string|null};
export type ForecastOverviewEvent={id:string;date:string;amount:number;title:string};
export type ForecastOverviewSuggestion={id:string;nextDate:string;amount:number;title:string;confidence:number};
export type ForecastOverview={projectedBalance:number;lowestBalance:number;events:ForecastOverviewEvent[];suggestions:ForecastOverviewSuggestion[]};

/**
 * Compatibility facade for Home and the forecast API.
 * The canonical forecast source is financial_app_forecast_liquidity/calendar;
 * the legacy financial_app_forecast_overview RPC is intentionally not queried.
 */
export async function getForecastOverview(days=30):Promise<ForecastOverview>{
  const liquidity=await getForecastLiquidity(days);
  return{
    projectedBalance:liquidity.summary.projectedEndBalance,
    lowestBalance:liquidity.summary.minimumProjectedBalance,
    events:liquidity.commitments.map(item=>({id:item.id,date:item.effectiveDate,amount:item.estimatedAmount,title:item.title})),
    suggestions:[],
  };
}
