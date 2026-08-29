import { APP_VERSION } from "@/lib/app-version";
import { asArray,asBoolean,asNumber,asRecord,asString,nullableString } from "@/lib/validation/json";

export type ScenarioKind="once"|"monthly"|"installments";
export type ScenarioEventInput={id:string;title:string;date:string;amount:number;kind:ScenarioKind;count:number;intervalMonths:number};
export type ScenarioDay={date:string;baselineBalance:number;scenarioNet:number;scenarioOccurrences:number;scenarioBalance:number};
export type ScenarioExpandedEvent={definitionId:string;title:string;kind:ScenarioKind;date:string;amount:number;occurrence:number;occurrenceCount:number;intervalMonths:number};
export type ScenarioLiquiditySummary={
  openingBalance:number;baselineEndBalance:number;scenarioEndBalance:number;endBalanceDelta:number;
  baselineMinimumBalance:number;scenarioMinimumBalance:number;scenarioMinimumDate:string|null;minimumBalanceDelta:number;
  baselineDaysBelowZero:number;scenarioDaysBelowZero:number;daysBelowZeroDelta:number;firstNegativeDate:string|null;
  hypotheticalNet:number;definitions:number;occurrences:number;crossesZero:boolean;
};
export type ForecastScenarioOverview={
  version:string;startDate:string;endDate:string;days:number;
  baseline:{summary:Record<string,unknown>;horizons:Record<string,unknown>};
  summary:ScenarioLiquiditySummary;
  horizons:{days30:number|null;days60:number|null;days90:number|null};
  daily:ScenarioDay[];expandedEvents:ScenarioExpandedEvent[];
  rules:{usesCanonicalLiquidity:boolean;ephemeral:boolean;noPersistence:boolean;sourceDataReadOnly:boolean;maximumDays:number;maximumDefinitions:number;maximumOccurrences:number};
};

const kind=(value:unknown):ScenarioKind=>value==="monthly"?"monthly":value==="installments"?"installments":"once";
const nullableNumeric=(value:unknown)=>value==null?null:asNumber(value);
const scenarioDay=(value:unknown):ScenarioDay=>{const x=asRecord(value);return{date:asString(x.date),baselineBalance:asNumber(x.baselineBalance),scenarioNet:asNumber(x.scenarioNet),scenarioOccurrences:asNumber(x.scenarioOccurrences),scenarioBalance:asNumber(x.scenarioBalance)}};
const expandedEvent=(value:unknown):ScenarioExpandedEvent=>{const x=asRecord(value);return{definitionId:asString(x.definitionId),title:asString(x.title),kind:kind(x.kind),date:asString(x.date),amount:asNumber(x.amount),occurrence:asNumber(x.occurrence),occurrenceCount:asNumber(x.occurrenceCount),intervalMonths:asNumber(x.intervalMonths,1)}};

export function normalizeForecastScenario(value:unknown):ForecastScenarioOverview{
  const r=asRecord(value),summary=asRecord(r.summary),horizons=asRecord(r.horizons),baseline=asRecord(r.baseline),rules=asRecord(r.rules);
  return{
    version:asString(r.version,APP_VERSION),startDate:asString(r.startDate),endDate:asString(r.endDate),days:asNumber(r.days,90),
    baseline:{summary:asRecord(baseline.summary),horizons:asRecord(baseline.horizons)},
    summary:{
      openingBalance:asNumber(summary.openingBalance),baselineEndBalance:asNumber(summary.baselineEndBalance),scenarioEndBalance:asNumber(summary.scenarioEndBalance),endBalanceDelta:asNumber(summary.endBalanceDelta),
      baselineMinimumBalance:asNumber(summary.baselineMinimumBalance),scenarioMinimumBalance:asNumber(summary.scenarioMinimumBalance),scenarioMinimumDate:nullableString(summary.scenarioMinimumDate),minimumBalanceDelta:asNumber(summary.minimumBalanceDelta),
      baselineDaysBelowZero:asNumber(summary.baselineDaysBelowZero),scenarioDaysBelowZero:asNumber(summary.scenarioDaysBelowZero),daysBelowZeroDelta:asNumber(summary.daysBelowZeroDelta),firstNegativeDate:nullableString(summary.firstNegativeDate),
      hypotheticalNet:asNumber(summary.hypotheticalNet),definitions:asNumber(summary.definitions),occurrences:asNumber(summary.occurrences),crossesZero:asBoolean(summary.crossesZero),
    },
    horizons:{days30:nullableNumeric(horizons["30"]),days60:nullableNumeric(horizons["60"]),days90:nullableNumeric(horizons["90"])},
    daily:asArray(r.daily).map(scenarioDay),expandedEvents:asArray(r.expandedEvents).map(expandedEvent),
    rules:{usesCanonicalLiquidity:asBoolean(rules.usesCanonicalLiquidity),ephemeral:asBoolean(rules.ephemeral),noPersistence:asBoolean(rules.noPersistence),sourceDataReadOnly:asBoolean(rules.sourceDataReadOnly),maximumDays:asNumber(rules.maximumDays,180),maximumDefinitions:asNumber(rules.maximumDefinitions,24),maximumOccurrences:asNumber(rules.maximumOccurrences,120)},
  };
}
