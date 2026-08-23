export const MADRID_TIME_ZONE="Europe/Madrid" as const;

type CalendarParts={year:string;month:string;day:string};

function calendarParts(date:Date):CalendarParts{
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:MADRID_TIME_ZONE,
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
  }).formatToParts(date);
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value;
  const year=value("year"),month=value("month"),day=value("day");
  if(!year||!month||!day)throw new Error("madrid_calendar_unavailable");
  return {year,month,day};
}

export function madridToday(date=new Date()){
  const {year,month,day}=calendarParts(date);
  return `${year}-${month}-${day}`;
}

export function madridMonth(date=new Date()){
  const {year,month}=calendarParts(date);
  return `${year}-${month}`;
}

export function madridYear(date=new Date()){
  return Number(calendarParts(date).year);
}
