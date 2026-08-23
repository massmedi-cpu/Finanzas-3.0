const ES_LOCALE="es-ES" as const;

function finite(value:number|null|undefined){return typeof value==="number"&&Number.isFinite(value);}

function formatDecimalCore(value:number,minimumFractionDigits:number,maximumFractionDigits:number){
  const negative=value<0&&!Object.is(value,-0);
  const rendered=new Intl.NumberFormat(ES_LOCALE,{useGrouping:false,minimumFractionDigits,maximumFractionDigits}).format(Math.abs(value));
  const [integer,fraction]=rendered.split(",");
  const grouped=integer.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return `${negative?"-":""}${grouped}${fraction!==undefined?`,${fraction}`:""}`;
}

export function formatNumber(value:number|null|undefined,options:{minimumFractionDigits?:number;maximumFractionDigits?:number}={}){
  if(!finite(value))return "—";
  const minimum=Math.max(0,Math.min(6,options.minimumFractionDigits??0));
  const maximum=Math.max(minimum,Math.min(6,options.maximumFractionDigits??2));
  return formatDecimalCore(value!,minimum,maximum);
}

export function formatInteger(value:number|null|undefined){
  return finite(value)?formatDecimalCore(Math.round(value!),0,0):"—";
}

export function formatEuro(value:number|null|undefined){
  return finite(value)?`${formatDecimalCore(value!,2,2)} €`:"—";
}

export function formatSignedEuro(value:number|null|undefined){
  if(!finite(value))return "—";
  const formatted=formatEuro(value);
  return value!>0?`+${formatted}`:formatted;
}

export function formatPercent(value:number|null|undefined,maximumFractionDigits=1){
  if(!finite(value))return "—";
  return `${formatDecimalCore(value!,0,Math.max(0,Math.min(4,maximumFractionDigits)))} %`;
}

export const ES_NUMBER_FORMAT_RULE="1.234.567,89" as const;
