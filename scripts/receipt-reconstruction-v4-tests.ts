import assert from "node:assert/strict";
import { reconstructReceiptEvidence, cleanReceiptMerchant } from "../lib/document/receipt-reconstruction";
import { validateReceiptFinancials } from "../lib/document/receipt-financial-validator";
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

console.log("receipt reconstruction integrity tests OK · 5 filas físicas · total 17,50 · sin reasignación por precio");
