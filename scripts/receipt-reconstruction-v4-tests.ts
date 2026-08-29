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
  {label:"Base",value:"15.91"},{label:"IVA",value:"1.59"},{label:"Total",value:"17.50"},
]);
assert.ok(rebuilt.layout.footer.some(line=>/powered by camarero\.com/i.test(line)),"el pie físico debe conservarse");

const validation=validateReceiptFinancials(rebuilt.layout,raw);
assert.equal(validation.status,"complete");
assert.equal(validation.itemSum,17.5);
assert.equal(validation.basePlusTax,17.5);
assert.equal(validation.printedTotal,17.5);
assert.equal(validation.contradictions.length,0);
assert.equal(cleanReceiptMerchant("Ávila Bar - Victoria Kent"),"Ávila Bar");

const shifted:ReceiptLayout={
  header:[],items:[item("DESCRIPCION DISTINTA","1","5.50","5.50",500,99)],summary:[],footer:[],unparsedBody:[],source:"geometry_tsv",
};
const noShift=reconstructReceiptEvidence(raw,[primary,shifted],"Ávila Bar - Victoria Kent");
assert.ok(noShift.layout);
assert.equal(noShift.layout.items.find(value=>value.top===350)?.description,"AGUA CON GAS");
assert.ok(noShift.layout.items.some(value=>value.description==="DESCRIPCION DISTINTA"),"una fila distante debe mantenerse como otra evidencia, no reasignarse por precio");

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
    {text:"PRODUCTO",score:95,left:23.3,top:30.92,width:18,height:2.8},
    {text:"A",score:95,left:42,top:30.95,width:3,height:2.75},
    {text:"1,60",score:97,left:68.1,top:31.12,width:8.1,height:2.7},
    {text:"1,60",score:97,left:87.4,top:31,width:8.2,height:2.7},
    {text:"1",score:96,left:13.1,top:36.05,width:2,height:2.65},
    {text:"PRODUCTO",score:95,left:23.1,top:35.94,width:18,height:2.82},
    {text:"B",score:95,left:42,top:35.96,width:3,height:2.7},
    {text:"7,50",score:97,left:68.3,top:36.1,width:8,height:2.72},
    {text:"7,50",score:97,left:87.5,top:36.02,width:8.1,height:2.72},
    {text:"X",score:32,left:2,top:92,width:0.7,height:0.8},
  ],
});
const visualHeader=visual.tokens.find(token=>token.text==="COMERCIO");
assert.ok(visualHeader);
const visualHeaderCenter=visualHeader.renderX;
assert.equal(visualHeader.textAnchor,"middle");
assert.ok(Math.abs(visualHeaderCenter-300)<1,"un bloque geométricamente centrado debe permanecer centrado");
const tableHeader=visual.tokens.filter(token=>["UND.","DESCRIPCION","PRECIO","IMPORTE"].includes(token.text));
assert.equal(new Set(tableHeader.map(token=>Math.round(token.baselineY*10))).size,1,"todos los tokens de una fila deben compartir baseline");
assert.ok(visual.tokens.some(token=>token.text==="PRODUCTO A"),"las palabras de una descripción deben agruparse en una sola celda");
const price160=visual.tokens.find(token=>token.text==="1,60"&&token.x<500);
const price750=visual.tokens.find(token=>token.text==="7,50"&&token.x<500);
const amount160=visual.tokens.find(token=>token.text==="1,60"&&token.x>500);
const amount750=visual.tokens.find(token=>token.text==="7,50"&&token.x>500);
assert.ok(price160&&price750&&amount160&&amount750);
assert.equal(price160.textAnchor,"end");
assert.ok(Math.abs(price160.renderX-price750.renderX)<1.5,"la columna precio debe compartir ancla derecha");
assert.ok(Math.abs(amount160.renderX-amount750.renderX)<1.5,"la columna importe debe compartir ancla derecha");
assert.equal(visual.tokens.some(token=>token.text==="X"),false,"un outlier diminuto, aislado y poco fiable debe filtrarse");
assert.ok(visual.tokens.every(token=>token.letterSpacing===0),"el renderer no debe volver a estirar palabras con tracking artificial");

// Geometría real del ticket de Coria usado para validar la reconstrucción actual.
const currentTicket=buildReceiptVisualModel({
  bounds:{width:1576.2,height:2493.06},
  lines:[
    {text:"¿",score:79,left:35.2176,top:4.0938,width:1.0785,height:.6819},
    {text:"PISUERGA-SN",score:92,left:15.9942,top:21.823,width:22.6494,height:3.1688},
    {text:"TEL,",score:95,left:54.3776,top:23.8687,width:6.4078,height:1.805},
    {text:"686108450",score:96,left:62.8791,top:23.5077,width:17.447,height:2.1259},
    {text:"UND.",score:74,left:15.6769,top:44.1249,width:9.009,height:2.8078},
    {text:"DESCRIPCION",score:88,left:31.0303,top:44.3656,width:24.8065,height:3.249},
    {text:"PRECIO",score:44,left:59.0725,top:45.0876,width:14.0211,height:2.8078},
    {text:"IMPORTE",score:96,left:74.7431,top:45.0876,width:15.0996,height:1.8451},
    {text:"1",score:94,left:16.6286,top:47.8151,width:.8882,height:1.9655},
    {text:"CERVEZA",score:94,left:21.7675,top:47.8954,width:15.9878,height:2.0858},
    {text:"1/2",score:94,left:39.2146,top:48.3366,width:4.2507,height:1.8451},
    {text:"s00",score:79,left:65.5437,top:48.8179,width:6.8519,height:1.5643},
    {text:"300",score:85,left:81.4046,top:48.6976,width:6.9154,height:2.0056},
    {text:"1",score:91,left:16.3114,top:50.7433,width:.8882,height:1.805},
    {text:"CERVEZA",score:78,left:21.7041,top:50.8235,width:15.9878,height:1.8451},
    {text:"SIN",score:78,left:38.707,top:50.9438,width:5.3927,height:1.8451},
    {text:"1,60",score:93,left:66.1781,top:51.3048,width:6.0272,height:1.9655},
    {text:"160",score:81,left:81.9756,top:51.6257,width:6.725,height:2.0457},
    {text:"1",score:92,left:16.1845,top:53.5912,width:.8882,height:1.805},
    {text:"PLATO",score:71,left:21.5772,top:53.5912,width:10.9123,height:1.9655},
    {text:"DE",score:71,left:33.7584,top:53.6714,width:4.5045,height:1.9655},
    {text:"PATATAS",score:96,left:39.5318,top:53.7516,width:15.4803,height:2.0056},
    {text:"2,00",score:95,left:65.7975,top:54.1928,width:6.5347,height:2.0457},
    {text:"2.00",score:93,left:82.166,top:54.5538,width:6.6616,height:1.9253},
    {text:"1",score:85,left:16.1211,top:56.4792,width:.9517,height:1.7649},
    {text:"CHURRASCO",score:90,left:21.4503,top:56.5193,width:22.3322,height:2.1259},
    {text:"DE",score:96,left:45.1148,top:56.76,width:4.5679,height:2.0056},
    {text:"7,50",score:84,left:65.9244,top:57.2012,width:6.4713,height:2.0457},
    {text:"7,50",score:95,left:82.4197,top:57.482,width:6.6616,height:2.0457},
    {text:"1",score:95,left:16.1845,top:59.4073,width:.9517,height:1.805},
    {text:"SALSAS",score:43,left:21.5138,top:59.4474,width:12.8791,height:1.9655},
    {text:"0,50",score:95,left:65.734,top:60.1694,width:6.725,height:2.1259},
    {text:"0,50",score:91,left:82.3563,top:60.4903,width:7.1691,height:2.0056},
    {text:"FORMA",score:96,left:15.2963,top:68.8335,width:12.1178,height:2.166},
    {text:"DE",score:93,left:28.556,top:69.0741,width:4.5679,height:2.0858},
    {text:"PAGO:EFECTIVO",score:92,left:34.3928,top:69.2346,width:28.8035,height:2.6473},
    {text:"—",score:71,left:77.2808,top:77.7382,width:2.3474,height:4.2919},
    {text:"1460",score:83,left:82.3563,top:79.3828,width:9.58,height:2.4869},
    {text:"IVA",score:94,left:68.6525,top:83.5945,width:6.0272,height:2.4067},
    {text:"INCLUIDO",score:96,left:75.885,top:83.8752,width:19.16,height:2.8479},
    {text:"GRACIAS",score:96,left:25.8279,top:87.2045,width:16.305,height:2.6473},
    {text:"POR",score:96,left:43.4653,top:87.7259,width:7.6767,height:2.2863},
    {text:"SU",score:95,left:52.4743,top:88.0869,width:4.8217,height:2.2462},
    {text:"VISITA",score:95,left:58.5649,top:88.2875,width:12.0543,height:2.8078},
    {text:"E",score:25,left:4.955,top:89.0897,width:2.2205,height:1.2836},
    {text:"LE",score:90,left:13.2026,top:91.0151,width:4.1873,height:2.4468},
    {text:"ATENDIO",score:90,left:18.3416,top:91.2557,width:16.3685,height:2.8078},
    {text:"JUAN",score:96,left:36.8671,top:91.9777,width:9.6434,height:2.3265},
    {text:"MEJIAS",score:84,left:47.9698,top:92.0178,width:13.1963,height:3.0485},
  ],
});
assert.equal(currentTicket.tokens.some(token=>token.text==="¿"),false,"el ruido aislado superior no debe aparecer en el ticket");
assert.equal(currentTicket.tokens.some(token=>token.text==="E"),false,"un carácter aislado de baja confianza no debe aparecer en el pie");
assert.ok(currentTicket.tokens.some(token=>token.text==="CERVEZA 1/2"),"la descripción partida debe recomponerse como una celda");
assert.ok(currentTicket.tokens.some(token=>token.text==="PLATO DE PATATAS"),"una descripción de tres cajas OCR debe quedar como una sola línea");
assert.ok(currentTicket.tokens.filter(token=>token.text==="3,00").length>=2,"un importe sin separador y un precio ilegible pueden resolverse por consistencia de fila");
assert.ok(currentTicket.tokens.filter(token=>token.text==="1,60").length>=2,"los céntimos omitidos en una caja deben normalizarse en la tabla");
assert.ok(currentTicket.tokens.some(token=>token.text==="14,60"),"el total visual debe validarse contra la suma de importes reconstruidos");
assert.equal(currentTicket.tokens.some(token=>token.text==="1460"),false,"el total no debe mostrarse sin separador decimal cuando la tabla lo valida");
const thanks=currentTicket.tokens.find(token=>token.text==="GRACIAS POR SU VISITA");
const attended=currentTicket.tokens.find(token=>token.text==="LE ATENDIO JUAN MEJIAS");
assert.ok(thanks&&attended,"el pie debe renderizar frases completas, no palabras sueltas");
assert.equal(thanks.textAnchor,"middle");
assert.equal(attended.textAnchor,"middle");
assert.ok(Math.abs(thanks.renderX-currentTicket.width/2)<1&&Math.abs(attended.renderX-currentTicket.width/2)<1,"el pie geométricamente centrado debe compartir eje");

console.log("receipt reconstruction integrity tests OK · contenido físico + filas completas + dinero validado + centrado protegidos");