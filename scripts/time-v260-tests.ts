import assert from "node:assert/strict";
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

console.log("Financial App 2.6 Madrid time tests OK · límites de día, mes y año protegidos");
