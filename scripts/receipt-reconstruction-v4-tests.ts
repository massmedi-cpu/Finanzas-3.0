import assert from "node:assert/strict";
import { reconstructReceiptEvidence, cleanReceiptMerchant } from "../lib/document/receipt-reconstruction";
import { validateReceiptFinancials } from "../lib/document/receipt-financial-validator";
import { buildReceiptVisualModel } from "../lib/document/receipt-visual-model";
import type { ReceiptLayout, ReceiptLineItem } from "../lib/document/receipt-layout";

const item=(description:string,quantity:string,unitPrice:string,total:string,top:number,confidence=92):ReceiptLineItem=>({
  description,quantity,unitPrice,total,top,bottom:top+22,confidence,sourceLine:`${description} ${quantity} ${unitPrice} ${total}`
});

// Regression del contenido físico del ticket real. Los valores esperados viven
// únicamente en tests: el runtime no contiene vocabulario ni reglas de este ticket.
const primary:ReceiptLayout={
  header:[
    "Ávila Bar - Victoria Kent",
    "22/08/2026 00:08",
    "Mesas 17 - Terraza",
    "641552438",
  ],
  items:[
    item("ENERGY","1","1.80","1.80",190),
    item("TERCIO","1","2.80","2.80",230),
    item("CAÑA GRANDE","2","2.80","5.60",270),
    item("AGUA CON GAS","1","1.80","1.80",350),
  ],
  unparsedBody:[{text:"CUBATA 1 5.50 5.50",top:310,bottom:332,confidence:48}],
  summary:[{label:"Base",value:"15.91"},{label:"IVA",value:"1.59"},{label:"Total",value:"17.50"}],
  footer:["Powered by camarero.com"],
  source:"geometry_tsv",
};

const secondary:ReceiptLayout={
  header:["Ávila Bar - Victoria Kent"],
  items:[item("CUBATA","1","5.50","5.50",311,96)],
  summary:[{label:"Total",value:"17.50"}],
  footer:["Powered by camarero.com"],
  unparsedBody:[],
  source:"geometry_tsv",
};

const raw=[
  "Ávila Bar - Victoria Kent\n22/08/2026 00:08\nMesas 17 - Terraza\n641552438\nBase 15.91\nIVA 1.59\nTOTAL 17.50\nPowered by camarero.com",
  "CUBATA 1 5.50 5.50\nTOTAL 17.50",
];

const rebuilt=reconstructReceiptEvidence(raw,[primary,secondary],"Ávila Bar - Victoria Kent");
assert.ok(rebuilt.layout,"el ticket debe conservar una estructura física reconstruida");
assert.equal(rebuilt.layout.items.length,5,"no puede desaparecer ninguna de las cinco filas físicas");
assert.deepEqual(rebuilt.layout.items.map(value=>value.description),[
  "ENERGY","TERCIO","CAÑA GRANDE","CUBATA","AGUA CON GAS",
]);
assert.deepEqual(rebuilt.layout.items.map(value=>[value.quantity,value.unitPrice,value.total]),[
  ["1","1.80","1.80"],
  ["1","2.80","2.80"],
  ["2","2.80","5.60"],
  ["1","5.50","5.50"],
  ["1","1.80","1.80"],
]);
assert.equal(rebuilt.layout.unparsedBody?.length,0,"la segunda observación debe completar exactamente la fila física dudosa");
assert.equal(rebuilt.total,17.5,"el total impreso y Base+IVA deben resolver 17,50");
assert.deepEqual(rebuilt.layout.summary,[
  {label:"Base",value:"15.91"},
  {label:"IVA",value:"1.59"},
  {label:"Total",value:"17.50"},
]);
assert.ok(rebuilt.layout.footer.some(line=>/powered by camarero\.com/i.test(line)),"el pie físico debe conservarse");

const validation=validateReceiptFinancials(rebuilt.layout,raw);
assert.equal(validation.status,"complete");
assert.equal(validation.itemSum,17.5);
assert.equal(validation.basePlusTax,17.5);
assert.equal(validation.printedTotal,17.5);
assert.equal(validation.contradictions.length,0);
assert.equal(cleanReceiptMerchant("Ávila Bar - Victoria Kent"),"Ávila Bar");

// Una observación con el mismo precio pero otra altura nunca puede robar una descripción.
const shifted:ReceiptLayout={
  header:[],
  items:[item("DESCRIPCION DISTINTA","1","5.50","5.50",500,99)],
  summary:[],footer:[],unparsedBody:[],source:"geometry_tsv",
};
const noShift=reconstructReceiptEvidence(raw,[primary,shifted],"Ávila Bar - Victoria Kent");
assert.ok(noShift.layout);
assert.equal(noShift.layout.items.find(value=>value.top===350)?.description,"AGUA CON GAS");
assert.ok(noShift.layout.items.some(value=>value.description==="DESCRIPCION DISTINTA"),"una fila distante debe mantenerse como otra evidencia, no reasignarse por precio");

// El renderer documental debe alinear por geometría, no por vocabulario del ticket.
const visual=buildReceiptVisualModel({
  bounds:{width:600,height:1000},
  lines:[
    {text:"COMERCIO",score:96,left:36,top:5,width:28,height:3.4},
    {text:"CALLE PRINCIPAL",score:95,left:30,top:10,width:40,height:2.6},
    {text:"UND.",score:98,left:10,top:25,width:8,height:3.1},
    {text:"DESCRIPCION",score:98,left:23,top:25.15,width:28,height:3.2},
    {text:"PRECIO",score:98,left:64,top:24.92,width:13,height:3.15},
    {text:"IMPORTE",score:98,left:82,top:25.08,width:14,height:3.05},
    {text:"1",score:96,left:13,top:31.05,width:2,height:2.6},
    {text:"PRODUCTO A",score:95,left:23.3,top:30.92,width:28,height:2.8},
    {text:"1,60",score:97,left:68.1,top:31.12,width:8.1,height:2.7},
    {text:"1,60",score:97,left:87.4,top:31,width:8.2,height:2.7},
    {text:"1",score:96,left:13.1,top:36.05,width:2,height:2.65},
    {text:"PRODUCTO B",score:95,left:23.1,top:35.94,width:28,height:2.82},
    {text:"7,50",score:97,left:68.3,top:36.1,width:8,height:2.72},
    {text:"7,50",score:97,left:87.5,top:36.02,width:8.1,height:2.72},
    {text:"X",score:32,left:2,top:92,width:0.7,height:0.8},
  ],
});
const visualHeader=visual.tokens.find(token=>token.text==="COMERCIO");
assert.ok(visualHeader);
const visualHeaderCenter=visualHeader.renderX+(visualHeader.textAnchor==="start"?visualHeader.boxWidth/2:0);
assert.ok(Math.abs(visualHeaderCenter-300)<12,"un bloque geométricamente centrado debe permanecer centrado");
const tableHeader=visual.tokens.filter(token=>["UND.","DESCRIPCION","PRECIO","IMPORTE"].includes(token.text));
assert.equal(new Set(tableHeader.map(token=>Math.round(token.baselineY*10))).size,1,"todos los tokens de una fila deben compartir baseline");
const price160=visual.tokens.find(token=>token.text==="1,60"&&token.x<500);
const price750=visual.tokens.find(token=>token.text==="7,50"&&token.x<500);
const amount160=visual.tokens.find(token=>token.text==="1,60"&&token.x>500);
const amount750=visual.tokens.find(token=>token.text==="7,50"&&token.x>500);
assert.ok(price160&&price750&&amount160&&amount750);
assert.equal(price160.textAnchor,"end");
assert.ok(Math.abs(price160.renderX-price750.renderX)<1.5,"la columna precio debe compartir ancla derecha");
assert.ok(Math.abs(amount160.renderX-amount750.renderX)<1.5,"la columna importe debe compartir ancla derecha");
assert.equal(visual.tokens.some(token=>token.text==="X"),false,"un outlier diminuto, aislado y poco fiable debe filtrarse");
assert.ok(visual.tokens.every(token=>Math.abs(token.letterSpacing)<=token.fontSize*0.036),"el tracking no puede deformar la impresión térmica");

console.log("receipt reconstruction integrity tests OK · contenido físico + baseline + columnas + centrado + tracking protegidos");
