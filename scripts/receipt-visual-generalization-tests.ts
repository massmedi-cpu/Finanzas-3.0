import assert from "node:assert/strict";
import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "../lib/document/receipt-visual-model";

function visual(width:number,height:number,lines:ReceiptVisualLayoutInput["lines"]){
  return buildReceiptVisualModel({bounds:{width,height},lines});
}

// Cabecera comercial alternativa: no depende de DESCRIPCION/IMPORTE exactos.
const commercial=visual(700,1000,[
  {text:"TIENDA EJEMPLO",score:98,left:35,top:5,width:30,height:3},
  {text:"CANT",score:97,left:7,top:24,width:8,height:2.8},
  {text:"CODIGO",score:96,left:18,top:24,width:12,height:2.8},
  {text:"ARTICULO",score:96,left:33,top:24,width:18,height:2.8},
  {text:"PRECIO",score:97,left:65,top:24,width:12,height:2.8},
  {text:"SUBTOTAL",score:97,left:82,top:24,width:14,height:2.8},
  {text:"1",score:98,left:10,top:30,width:2,height:2.5},
  {text:"A123",score:95,left:19,top:30,width:8,height:2.5},
  {text:"PAN",score:98,left:34,top:30,width:8,height:2.5},
  {text:"1,20",score:98,left:68,top:30,width:8,height:2.5},
  {text:"1,20",score:98,left:87,top:30,width:8,height:2.5},
  {text:"2",score:98,left:10,top:35,width:2,height:2.5},
  {text:"B245",score:96,left:19,top:35,width:8,height:2.5},
  {text:"AGUA",score:98,left:34,top:35,width:10,height:2.5},
  {text:"0,80",score:98,left:68,top:35,width:8,height:2.5},
  {text:"1,60",score:98,left:87,top:35,width:8,height:2.5},
]);
const commercialPrice=commercial.tokens.filter(token=>token.text==="1,20");
assert.equal(commercialPrice.length,2,"la fila comercial debe mantener precio e importe separados");
assert.ok(commercial.tokens.some(token=>/A123 PAN/.test(token.text)),"código y descripción reconocidos en la misma zona física deben conservarse");
const priceAnchor=commercial.tokens.find(token=>token.text==="0,80");
const amountAnchor=commercial.tokens.find(token=>token.text==="1,60");
assert.ok(priceAnchor&&amountAnchor&&priceAnchor.textAnchor==="end"&&amountAnchor.textAnchor==="end");
assert.ok(priceAnchor.renderX<amountAnchor.renderX,"precio y subtotal deben conservar columnas distintas");

// Ticket sencillo sin cabecera de tabla: varias filas con descripción a la
// izquierda e importe alineado a la derecha deben formar una tabla implícita.
const simple=visual(420,700,[
  {text:"CAFETERIA",score:98,left:36,top:5,width:28,height:3},
  {text:"CAFE",score:97,left:12,top:28,width:20,height:2.8},
  {text:"1,40",score:98,left:79,top:28,width:12,height:2.8},
  {text:"TOSTADA",score:97,left:12,top:34,width:28,height:2.8},
  {text:"2,10",score:98,left:79,top:34,width:12,height:2.8},
  {text:"ZUMO",score:97,left:12,top:40,width:18,height:2.8},
  {text:"2,50",score:98,left:79,top:40,width:12,height:2.8},
  {text:"TOTAL",score:99,left:55,top:52,width:15,height:3},
  {text:"6,00",score:99,left:79,top:52,width:12,height:3},
]);
const simpleAmounts=simple.tokens.filter(token=>["1,40","2,10","2,50"].includes(token.text));
assert.equal(simpleAmounts.length,3);
assert.equal(new Set(simpleAmounts.map(token=>Math.round(token.renderX))).size,1,"los importes de una tabla implícita deben compartir ancla derecha");
assert.ok(simple.tokens.some(token=>token.text==="CAFE")&&simple.tokens.some(token=>token.text==="TOSTADA")&&simple.tokens.some(token=>token.text==="ZUMO"));
assert.ok(simple.tokens.some(token=>token.text==="6,00"),"el total impreso debe conservarse tras la tabla implícita");

// Una continuación física de descripción no puede hacer desaparecer el resto
// de la tabla ni ser arrastrada a otra fila monetaria.
const wrapped=visual(600,900,[
  {text:"UND.",score:98,left:8,top:20,width:8,height:2.8},
  {text:"DESCRIPCION",score:98,left:22,top:20,width:24,height:2.8},
  {text:"PRECIO",score:98,left:64,top:20,width:12,height:2.8},
  {text:"IMPORTE",score:98,left:82,top:20,width:14,height:2.8},
  {text:"1",score:98,left:10,top:27,width:2,height:2.5},
  {text:"PRODUCTO",score:98,left:22,top:27,width:18,height:2.5},
  {text:"3,00",score:98,left:68,top:27,width:8,height:2.5},
  {text:"3,00",score:98,left:87,top:27,width:8,height:2.5},
  {text:"CON DESCRIPCION LARGA",score:96,left:22,top:31,width:38,height:2.5},
  {text:"1",score:98,left:10,top:37,width:2,height:2.5},
  {text:"OTRO",score:98,left:22,top:37,width:12,height:2.5},
  {text:"2,00",score:98,left:68,top:37,width:8,height:2.5},
  {text:"2,00",score:98,left:87,top:37,width:8,height:2.5},
]);
const wrappedContinuation=wrapped.tokens.find(token=>token.text==="CON DESCRIPCION LARGA");
const wrappedFirst=wrapped.tokens.find(token=>token.text==="PRODUCTO");
assert.ok(wrappedContinuation&&wrappedFirst,"la continuación física debe seguir visible");
assert.ok(Math.abs(wrappedContinuation.renderX-wrappedFirst.renderX)<1,"las líneas continuadas deben respetar el inicio de la columna descripción");
assert.equal(wrapped.tokens.filter(token=>token.text==="2,00").length,2,"la fila posterior a una descripción envuelta debe conservar precio e importe");

// La geometría normalizada debe escalar sin cambiar la estructura al recibir
// una imagen estrecha o una captura de mucha más resolución.
const normalizedLines:ReceiptVisualLayoutInput["lines"]=[
  {text:"UND.",score:98,left:8,top:20,width:8,height:3},
  {text:"DESCRIPCION",score:98,left:22,top:20,width:24,height:3},
  {text:"PRECIO",score:98,left:64,top:20,width:12,height:3},
  {text:"IMPORTE",score:98,left:82,top:20,width:14,height:3},
  {text:"1",score:98,left:10,top:28,width:2,height:2.6},
  {text:"ARTICULO",score:98,left:22,top:28,width:18,height:2.6},
  {text:"4,25",score:98,left:68,top:28,width:8,height:2.6},
  {text:"4,25",score:98,left:87,top:28,width:8,height:2.6},
];
const narrow=visual(300,700,normalizedLines);
const wide=visual(1200,2800,normalizedLines);
const narrowAmount=narrow.tokens.find(token=>token.text==="4,25"&&token.renderX>narrow.width*.75)!;
const wideAmount=wide.tokens.find(token=>token.text==="4,25"&&token.renderX>wide.width*.75)!;
assert.ok(Math.abs(narrowAmount.renderX/narrow.width-wideAmount.renderX/wide.width)<.002,"las columnas deben escalar por geometría normalizada, no por píxeles fijos");

console.log("receipt visual generalization tests OK · cabeceras alternativas, tabla implícita, descripciones envueltas y escalado geométrico protegidos");
