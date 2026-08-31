const ISO_CALENDAR_DATE=/^(\d{4})-(\d{2})-(\d{2})$/;

function leapYear(year:number){
  return year%4===0&&(year%100!==0||year%400===0);
}

export function validCalendarDate(value:unknown){
  if(typeof value!=="string")return null;
  const match=value.match(ISO_CALENDAR_DATE);if(!match)return null;
  const year=Number(match[1]);const month=Number(match[2]);const day=Number(match[3]);
  if(year<1||month<1||month>12||day<1)return null;
  const days=[31,leapYear(year)?29:28,31,30,31,30,31,31,30,31,30,31];
  return day<=days[month-1]?value:null;
}
