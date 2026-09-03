import assert from "node:assert/strict";
import fs from "node:fs";

const view=fs.readFileSync("app/movimientos/movements-client.tsx","utf8");
const css=fs.readFileSync("app/movements.css","utf8");

const itemMaps=[...view.matchAll(/pageData\.items\.map\(/g)];
assert.equal(itemMaps.length,1,"Movimientos debe renderizar cada item una sola vez, no duplicar tabla y tarjetas por breakpoint");
assert.ok(!view.includes('className="movement-cards"'),"no debe existir una segunda lista móvil de movimientos");
assert.ok(view.includes('className="movement-date-cell"'),"la fila única debe exponer áreas responsive explícitas");
assert.ok(view.includes('className="movement-main-cell"'),"la fila única debe conservar concepto y origen en la misma representación");
assert.ok(view.includes('className="movement-amount-cell'),"la fila única debe conservar importe/saldo/parte personal");
assert.ok(css.includes(".movement-table tbody tr{content-visibility:auto"),"las filas deben conservar renderizado diferido fuera de viewport");
assert.ok(css.includes("@media(max-width:760px)"),"la representación única debe seguir siendo responsive");
assert.ok(css.includes("grid-template-areas"),"el layout móvil debe remaquetar la misma fila, no crear otra lista");
assert.ok(!css.includes(".movement-table-wrap{display:none}"),"móvil no debe ocultar la tabla para mostrar una copia duplicada");
assert.ok(!css.includes(".movement-cards{display:grid"),"móvil no debe activar una segunda representación");

console.log("Movement single-render tests OK · una sola fila por movimiento en desktop/móvil, DOM duplicado eliminado");
