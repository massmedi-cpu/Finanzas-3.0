export type AnalysisPeriodKey="year"|"month"|"previous-month"|"last30"|"last3"|"last6"|"last12"|"q1"|"q2"|"q3"|"q4"|"custom";

type Params={period?:string;year?:string;from?:string;to?:string};
export type ResolvedAnalysisPeriod={period:AnalysisPeriodKey;year:number;from:string;to:string};

const PERIODS=new Set<AnalysisPeriodKey>(["year","month","previous-month","last30","last3","last6","last12","q1","q2","q3","q4","custom"]);
const pad=(value:number)=>String(value).padStart(2,"0");
const ymd=(date:Date)=>`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
const parse=(value:string)=>{const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return null;const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));return ymd(date)===value?date:null};
const minDate=(a:string,b:string)=>a<b?a:b;
const addDays=(value:string,days:number)=>{const date=parse(value);if(!date)return value;date.setUTCDate(date.getUTCDate()+days);return ymd(date)};
const addMonths=(value:string,months:number)=>{const source=parse(value);if(!source)return value;const day=source.getUTCDate();const target=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+months,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,last));return ymd(target)};
const monthStart=(value:string)=>`${value.slice(0,7)}-01`;
const monthEnd=(value:string)=>{const date=parse(monthStart(value));if(!date)return value;date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return ymd(date)};
const validYear=(value:string|undefined,fallback:number)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=2000&&parsed<=2100?parsed:fallback};

export function resolveAnalysisPeriod(params:Params,today:string,currentYear:number):ResolvedAnalysisPeriod{
  const requested=PERIODS.has(params.period as AnalysisPeriodKey)?params.period as AnalysisPeriodKey:"year";
  const year=validYear(params.year,currentYear);
  if(requested==="month")return {period:"month",year:currentYear,from:monthStart(today),to:today};
  if(requested==="previous-month"){
    const previous=addMonths(monthStart(today),-1);
    return {period:"previous-month",year:Number(previous.slice(0,4)),from:previous,to:monthEnd(previous)};
  }
  if(requested==="last30")return {period:"last30",year:currentYear,from:addDays(today,-29),to:today};
  if(requested==="last3"||requested==="last6"||requested==="last12"){
    const months=requested==="last3"?3:requested==="last6"?6:12;
    return {period:requested,year:currentYear,from:monthStart(addMonths(today,-(months-1))),to:today};
  }
  if(requested==="custom"){
    const from=params.from&&parse(params.from)?params.from:null;
    const to=params.to&&parse(params.to)?params.to:null;
    if(from&&to&&from<=to&&from>="2000-01-01"&&to<=today&&Number(to.slice(0,4))-Number(from.slice(0,4))<=10)return {period:"custom",year:Number(to.slice(0,4)),from,to};
  }
  if(requested==="q1"||requested==="q2"||requested==="q3"||requested==="q4"){
    const quarter=Number(requested.slice(1));
    const currentQuarter=Math.floor((Number(today.slice(5,7))-1)/3)+1;
    const resolvedQuarter=year===currentYear&&quarter>currentQuarter?currentQuarter:quarter;
    const resolvedPeriod=`q${resolvedQuarter}` as AnalysisPeriodKey;
    const startMonth=(resolvedQuarter-1)*3+1;
    const from=`${year}-${pad(startMonth)}-01`;
    const endMonth=startMonth+2;
    const endAnchor=`${year}-${pad(endMonth)}-01`;
    return {period:resolvedPeriod,year,from,to:minDate(monthEnd(endAnchor),today)};
  }
  const from=`${year}-01-01`;
  return {period:"year",year,from,to:minDate(`${year}-12-31`,today)};
}
