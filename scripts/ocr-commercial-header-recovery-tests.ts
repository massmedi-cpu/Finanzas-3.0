import assert from "node:assert/strict";
import { recognizeTicketImage } from "../lib/document/ticket-ocr-engine";

const item=(text:string,left:number,top:number,width:number,score=.94)=>({
  text,
  score,
  poly:[[left,top],[left+width,top],[left+width,top+20],[left,top+20]],
});

const result={
  image:{width:1200,height:900},
  items:[
    item("ALBARAN",260,30,110),
    item("28/08/2026",260,70,120),
    // Cabecera degradada basada en la evidencia real de producción.
    item("[cantidad]",170,150,90,.06),
    item("Código",285,150,70,.88),
    item("Artículo",390,150,85,.90),
    item("Precio]",620,150,70,.05),
    item("WA]",760,150,45,.52),
    item("subtota",870,150,80,.17),
    // Dos líneas comerciales cuya aritmética es inequívoca.
    item("5,00",170,210,45,.92),
    item("09745",285,210,55,.93),
    item("CHAPA PERF. 2000*1000*4*5 T-8 HIERRO",390,210,210,.90),
    item("125,320",620,210,70,.96),
    item("21,00",760,210,55,.95),
    item("626,600",870,210,75,.97),
    item("1,00",170,255,45,.92),
    item("23",285,255,30,.92),
    item("PORTES TDN/TXT + PALET 2000*1000",390,255,205,.90),
    item("52,600",620,255,65,.96),
    item("21,00",760,255,55,.95),
    item("52,600",870,255,65,.97),
    // El total sigue ilegible: no debe inventarse.
    item("TOTAL ALBARAN",620,340,130,.88),
    item("821",870,340,40,.78),
    item("BACKGROUND",1080,220,100,.95),
  ],
  metrics:{detMs:10,recMs:30,totalMs:40,detectedBoxes:23,recognizedCount:23},
  runtime:"server-tesseract-7",
};

const engine={async predict(){return[result];}};
const file=new File([new Uint8Array([1,2,3])],"invoice.jpg",{type:"image/jpeg"});
const recognized=await recognizeTicketImage(file,engine,()=>undefined,"receipt");

assert.ok(recognized.rawText.includes("[cantidad]"));
assert.ok(recognized.rawText.includes("WA]"));
assert.ok(recognized.rawText.includes("subtota"));
assert.ok(recognized.text.includes("[cantidad]"),"La columna Cantidad de baja confianza debe conservarse por contexto de cabecera");
assert.ok(recognized.text.includes("IVA]"),"WA solo puede normalizarse a IVA dentro de una cabecera comercial fuerte");
assert.ok(/\bsubtotal\b/i.test(recognized.text),"subtota debe normalizarse a subtotal conservando el estilo de mayúsculas/minúsculas de la fuente");
assert.ok(!recognized.text.includes("BACKGROUND"),"El rescate de cabecera no puede reabrir el filtro de ruido exterior");
assert.equal(recognized.receiptLayout?.items.length,2,"La cabecera recuperada debe activar el parser comercial");
assert.deepEqual(recognized.receiptLayout?.items.map(row=>[row.quantity,row.unitPrice,row.total]),[
  ["5","125,32","626,60"],
  ["1","52,60","52,60"],
]);
assert.equal(recognized.validation?.itemSum,679.2);
assert.equal(recognized.validation?.printedTotal,null,"Un total sin decimales no puede inventarse");
assert.equal(recognized.validation?.status,"needs_review","Estructura comercial recuperada con total ilegible debe ir a revisión, no a fallo total ni complete");
assert.ok(recognized.validation?.contradictions.some(item=>item.code==="missing_total"));
assert.ok(!recognized.validation?.contradictions.some(item=>item.code==="missing_structure"));

const pass=recognized.passes[0] as typeof recognized.passes[0]&{discardedBoxes?:Array<{text?:string}>};
const discarded=(pass.discardedBoxes||[]).map(box=>String(box.text||""));
assert.ok(discarded.includes("BACKGROUND"));
assert.ok(!discarded.some(text=>/cantidad|precio|subtota/i.test(text)));

console.log("OCR commercial header recovery tests OK · cabecera degradada recuperada, 2 líneas válidas conservadas y total ilegible permanece needs_review");
