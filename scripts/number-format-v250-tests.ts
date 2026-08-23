import assert from "node:assert/strict";
import { formatEuro,formatInteger,formatNumber,formatPercent,formatSignedEuro } from "../lib/format/es-es";

assert.equal(formatInteger(999),"999");
assert.equal(formatInteger(1000),"1.000");
assert.equal(formatInteger(1234567),"1.234.567");
assert.equal(formatNumber(1234.56,{minimumFractionDigits:2,maximumFractionDigits:2}),"1.234,56");
assert.equal(formatNumber(1234567.89,{minimumFractionDigits:2,maximumFractionDigits:2}),"1.234.567,89");
assert.equal(formatEuro(1000),"1.000,00 €");
assert.equal(formatEuro(1234567.89),"1.234.567,89 €");
assert.equal(formatEuro(-1234.5),"-1.234,50 €");
assert.equal(formatSignedEuro(1234.5),"+1.234,50 €");
assert.equal(formatSignedEuro(-1234.5),"-1.234,50 €");
assert.equal(formatPercent(1234.5,1),"1.234,5 %");
assert.equal(formatEuro(null),"—");
assert.equal(formatNumber(Number.NaN),"—");

console.log("Financial App 2.5 formato es-ES OK · 1.234.567,89 € y miles con punto protegidos");
