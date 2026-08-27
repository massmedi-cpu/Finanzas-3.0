import assert from "node:assert/strict";
import { reconstructReceiptEvidence, cleanReceiptMerchant } from "../lib/document/receipt-reconstruction";

const adaptive = `E Js
Avila Bar - Victoria Ken ww
E R soe tute rl 1 d
= Ne: azon Social: Luis enrique ramirez mendoz
N.L.F,: B3984220 vu
Direccion: Calle Victoria Kent OU
+ E- Direccion fiscal: Calle victoria kent 3 local 3b
y 4h, , Sevilla, ES, SE xO
a Telefono: +34 841552438 (O
; EM Pedido por: Staff - LUÍS HERNANDEZ
Hora: 2026-08-22 00:02:03 UNN
AU ceca 0 PECIONANE y
KM ENERGY f 1.80 1.807 >”
DA OTERCIO GALICIA CERO 1 2.80 2.80
cap quo \"A 2 2.80 5.60,
CUBATA — y”): í 1 5.50 5.50
AGUANCON BAS 7 $T 1 1.80 1,80
AL A
- $ WE Total IVA +. 1.59.
4 Total: 17,50.
A o ii ia a r
¡ PENDIENTE DE PAGO : e
ba TAEIEEIISIEEESANEA Y
o Terraza;, — E
Aros by gamarero.con —> L E.`;

const gray = `azon Social: Luis Enríque ramirez mendoza
DESCRIPCION — UDS PRECIO IMPORTE SS
ENERGY 1 1.80 1808
TERCIO GALICIA CERO 1 2.80 2/80
CANA GRANDE 272.80. SA ;
AGUANCON pe L 1 1.80 1,808
A Total IVA LA
Total: —
Patito dute root toto td , r`;

const rebuilt = reconstructReceiptEvidence([adaptive, gray], [], "E E Avila Bar - Victoria Ken sw I");
assert.ok(rebuilt.layout, "el ticket real debe reconstruirse aunque las dos lecturas tengan errores distintos");
assert.equal(rebuilt.layout.items.length, 5, "no puede desaparecer ninguna de las cinco consumiciones");
assert.deepEqual(rebuilt.layout.items.map((item) => item.description), [
  "ENERGY",
  "TERCIO GALICIA CERO",
  "CAÑA GRANDE",
  "CUBATA",
  "AGUA CON GAS",
]);
assert.deepEqual(rebuilt.layout.items.map((item) => [item.quantity, item.unitPrice, item.total]), [
  ["1", "1,80", "1,80"],
  ["1", "2,80", "2,80"],
  ["2", "2,80", "5,60"],
  ["1", "5,50", "5,50"],
  ["1", "1,80", "1,80"],
]);
assert.equal(rebuilt.total, 17.5, "17,58 es imposible: las líneas y el TOTAL visible demuestran 17,50");
assert.deepEqual(rebuilt.layout.summary, [
  { label: "Base", value: "15.91" },
  { label: "IVA", value: "1.59" },
  { label: "Total", value: "17.50" },
]);
assert.equal(cleanReceiptMerchant("E E Avila Bar - Victoria Ken sw I"), "Avila Bar");

console.log("receipt-reconstruction-v4-tests OK · caso real Ávila reconstruido 5/5 · total 17,50");
