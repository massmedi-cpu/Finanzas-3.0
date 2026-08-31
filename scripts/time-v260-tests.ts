import assert from "node:assert/strict";
import fs from "node:fs";
import { validCalendarDate } from "../lib/time/calendar-date";
import { MADRID_TIME_ZONE,madridMonth,madridToday,madridYear } from "../lib/time/madrid";

assert.equal(MADRID_TIME_ZONE,"Europe/Madrid");

// En verano, 22:30 UTC ya pertenece al día siguiente en Madrid (UTC+2).
const summerBoundary=new Date("2026-08-22T22:30:00.000Z");
assert.equal(madridToday(summerBoundary),"2026-08-23");
assert.equal(madridMonth(summerBoundary),"2026-08");
assert.equal(madridYear(summerBoundary),2026);

// En invierno, 23:30 UTC del 31/12 ya es el año siguiente en Madrid (UTC+1).
const yearBoundary=new Date("2026-12-31T23:30:00.000Z");
assert.equal(madridToday(yearBoundary),"2027-01-01");
assert.equal(madridMonth(yearBoundary),"2027-01");
assert.equal(madridYear(yearBoundary),2027);

// Una fecha alejada del cambio conserva el día esperado.
const stable=new Date("2026-03-15T12:00:00.000Z");
assert.equal(madridToday(stable),"2026-03-15");

// Los endpoints financieros solo deben aceptar fechas reales de calendario.
for(const value of ["2026-08-31","2024-02-29","2000-02-29","0001-01-01"]){
  assert.equal(validCalendarDate(value),value);
}
for(const value of [null,"","2026-8-31","2026-13-01","2026-04-31","2026-02-29","2100-02-29","0000-01-01"]){
  assert.equal(validCalendarDate(value),null);
}
const forecastApi=fs.readFileSync("app/api/forecast/route.ts","utf8");
assert.match(forecastApi,/from "@\/lib\/time\/calendar-date"/);
assert.ok((forecastApi.match(/validCalendarDate\(/g)||[]).length>=3,"Previsión debe validar fecha principal, fin de recurrencia y fecha de descarte");

console.log("Financial App time tests OK · límites Madrid y fechas reales de calendario protegidos");
