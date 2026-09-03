import assert from "node:assert/strict";
import fs from "node:fs";
import { buildReceiptVisualRules } from "../lib/document/receipt-visual-rules";

const layout={
  bounds:{width:600,height:1000},
  lines:[
    {text:"TIENDA",score:98,left:35,top:6,width:30,height:3},
    {text:"-----",score:96,left:20,top:18,width:60,height:1.2},
    {text:".............",score:94,left:32,top:42,width:36,height:1},
    {text:"________",score:95,left:12,top:64,width:48,height:1.5},
    {text:"TOTAL 12,40",score:99,left:52,top:74,width:34,height:3},
  ],
};
const rules=buildReceiptVisualRules(layout);
assert.equal(rules.length,3,"solo los separadores físicos deben convertirse en reglas");
assert.ok(Math.abs(rules[0].x1-120)<.01&&Math.abs(rules[0].x2-480)<.01,"la raya no puede expandirse artificialmente a todo el ancho");
assert.ok(Math.abs(rules[1].x1-192)<.01&&Math.abs(rules[1].x2-408)<.01,"un separador corto y centrado debe conservar sus extremos OCR");
assert.equal(rules[0].pattern,"dashed");
assert.equal(rules[1].pattern,"dotted");
assert.equal(rules[2].pattern,"solid");
assert.ok(rules.every(rule=>rule.strokeWidth>=.45&&rule.strokeWidth<3),"el grosor debe derivarse de la caja sin convertirse en una banda");

const narrow=buildReceiptVisualRules({...layout,bounds:{width:300,height:500}});
assert.ok(Math.abs(narrow[0].x1/rules[0].x1-.5)<.001,"la geometría de separadores debe escalar con la reconstrucción");
assert.ok(Math.abs(narrow[0].x2/rules[0].x2-.5)<.001);

const preview=fs.readFileSync("app/archivo/receipt-geometry-preview.tsx","utf8");
assert.ok(preview.includes("buildReceiptVisualRules(layout)"),"la vista debe usar las reglas físicas y no volver a dibujarlas a ancho completo");
assert.ok(!preview.includes("x1={visual.width * 0.015}"),"no debe sobrevivir la raya genérica casi a ancho completo");
assert.ok(preview.includes('token.textAnchor === "middle" ? token.centerX : token.renderX'),"una fila centrada debe conservar el centro físico OCR en vez de forzarse al centro perfecto");
assert.ok(preview.includes('lengthAdjust="spacingAndGlyphs"'),"el ajuste de ancho OCR protegido por el contrato histórico debe seguir activo");

console.log("receipt visual fidelity tests OK · separadores, centro físico y escala real protegidos");
