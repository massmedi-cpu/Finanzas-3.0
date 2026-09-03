import assert from "node:assert/strict";
import fs from "node:fs";
import { receiptMoneyDisplayText } from "../lib/document/receipt-money-display";
import { receiptPhysicalPreviewLayout } from "../lib/document/receipt-visual-physical-layout";
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

const isolatedPaper=receiptPhysicalPreviewLayout({
  sourceWidth:720,
  sourceHeight:1320,
  bounds:{left:72,top:132,right:648,bottom:1188,width:576,height:1056},
  lines:[
    {text:"CABECERA",score:98,left:25,top:5,width:50,height:3},
    {text:"TOTAL 18,30",score:99,left:55,top:86,width:30,height:3},
  ],
});
assert.equal(isolatedPaper.bounds.width,720,"un papel ya aislado debe recuperar el ancho físico persistido");
assert.equal(isolatedPaper.bounds.height,1320,"un papel ya aislado debe recuperar el alto físico persistido");
assert.ok(Math.abs(isolatedPaper.lines[0].left-30)<.01,"el margen lateral real debe volver a la reconstrucción");
assert.ok(Math.abs(isolatedPaper.lines[0].top-14)<.01,"el margen superior real debe volver a la reconstrucción");

const backgroundPhoto={
  sourceWidth:1400,
  sourceHeight:900,
  bounds:{left:480,top:130,right:920,bottom:760,width:440,height:630},
  lines:[{text:"TICKET",score:98,left:20,top:10,width:60,height:4}],
};
const safeTight=receiptPhysicalPreviewLayout(backgroundPhoto);
assert.equal(safeTight.bounds.width,440,"una foto con mucho fondo no debe expandirse otra vez al tamaño completo de la imagen");
assert.equal(safeTight.bounds.height,630);
assert.equal(safeTight.lines[0].left,20,"el fallback estrecho debe ser idéntico al layout existente");

assert.equal(receiptMoneyDisplayText("2,50","2.50"),"2.50","un punto decimal impreso válido no debe convertirse visualmente en coma");
assert.equal(receiptMoneyDisplayText("2,50","2,50 €"),"2,50 €","el símbolo y espaciado monetario impresos deben conservarse");
assert.equal(receiptMoneyDisplayText("14,60","1460"),"14,60","un separador decimal inequívocamente perdido por OCR sí debe reconstruirse");
assert.equal(receiptMoneyDisplayText("14,60","1460 €"),"14,60 €","la reparación de un decimal perdido debe conservar la moneda original");
assert.equal(receiptMoneyDisplayText("1,50","€1'50"),"€1,50","un apóstrofo OCR en lugar del separador se repara sin perder la posición de la moneda");
assert.equal(receiptMoneyDisplayText("12,00","12"),"12","un entero realmente impreso no debe ganar decimales solo por la normalización financiera");
assert.equal(receiptMoneyDisplayText("7,40","8,40 €"),"7,40","una evidencia original contradictoria no puede imponerse al valor validado");
assert.equal(receiptMoneyDisplayText("DESCRIPCION LARGA","PRODUCTO"),"DESCRIPCION LARGA","la recuperación monetaria no debe tocar texto no financiero");

const preview=fs.readFileSync("app/archivo/receipt-geometry-preview.tsx","utf8");
assert.ok(preview.includes("receiptPhysicalPreviewLayout(layout)"),"la vista debe intentar recuperar los márgenes físicos antes de maquetar");
assert.ok(preview.includes("buildReceiptVisualRules(physicalLayout)"),"la vista debe usar las reglas físicas sobre el mismo espacio reconstruido");
assert.ok(preview.includes("receiptMoneyDisplayText(token.text, originalText)"),"la reconstrucción debe separar valor financiero normalizado y tipografía monetaria impresa");
assert.ok(!preview.includes("x1={visual.width * 0.015}"),"no debe sobrevivir la raya genérica casi a ancho completo");
assert.ok(preview.includes('token.textAnchor === "middle" ? token.centerX : token.renderX'),"una fila centrada debe conservar el centro físico OCR en vez de forzarse al centro perfecto");
assert.ok(preview.includes('lengthAdjust="spacingAndGlyphs"'),"el ajuste de ancho OCR protegido por el contrato histórico debe seguir activo");

console.log("receipt visual fidelity tests OK · separadores, centro físico, márgenes, moneda impresa y escala real protegidos");