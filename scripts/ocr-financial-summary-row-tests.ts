import assert from "node:assert/strict";
import { recognizeTicketImage } from "../lib/document/ticket-ocr-engine";

const item=(text:string,left:number,top:number,width:number,score=.96)=>({
  text,
  score,
  poly:[[left,top],[left+width,top],[left+width,top+20],[left,top+20]],
});

const result={
  image:{width:1000,height:900},
  items:[
    item("CAFETERIA CENTRAL",300,30,220),
    item("02/09/2026 05:00",300,65,180),
    item("DESCRIPCION",300,120,150),
    item("UDS",500,120,45),
    item("PRECIO",600,120,70),
    item("TOTAL",720,120,65),
    item("CAFE",300,180,80),
    item("1",520,180,20),
    item("3,00",620,180,50),
    item("3,00",730,180,50),
    item("BOCADILLO",300,225,115),
    item("1",520,225,20),
    item("11,60",620,225,55),
    item("11,60",730,225,55),
    // Caso real que motivó la regresión: etiqueta fragmentada fuera del corredor.
    item("TOTALA",20,330,70,.72),
    item("PAGAR:",95,330,70,.72),
    item("14,60",170,330,50,.88),
    // Ruido no financiero fuera del corredor: debe seguir descartándose.
    item("BACKGROUND",900,210,85,.94),
  ],
  metrics:{detMs:10,recMs:20,totalMs:30,detectedBoxes:18,recognizedCount:18},
  runtime:"server-tesseract-7",
};

const engine={async predict(){return[result];}};
const file=new File([new Uint8Array([1,2,3])],"receipt.jpg",{type:"image/jpeg"});
const recognized=await recognizeTicketImage(file,engine,()=>undefined,"receipt");

assert.ok(recognized.rawText.includes("TOTALA"),"La evidencia literal debe conservar exactamente TOTALA");
assert.ok(recognized.rawText.includes("BACKGROUND"),"La evidencia literal debe conservar también el ruido detectado por el motor");
assert.ok(recognized.text.includes("TOTAL A"),"El texto fiable debe normalizar el token inequívoco TOTALA");
assert.ok(recognized.text.includes("PAGAR:"),"La etiqueta de pago de la misma fila financiera debe sobrevivir al corredor");
assert.ok(recognized.text.includes("14,60"),"El importe de la fila financiera debe sobrevivir junto a su etiqueta");
assert.ok(!recognized.text.includes("BACKGROUND"),"El ruido exterior no financiero debe seguir descartándose");
assert.equal(recognized.receiptLayout?.summary.at(-1)?.value,"14,60");
assert.equal(recognized.validation?.printedTotal,14.6);
assert.equal(recognized.validation?.itemSum,14.6);
assert.equal(recognized.validation?.status,"complete");

const pass=recognized.passes[0] as typeof recognized.passes[0]&{discardedBoxes?:Array<{text?:string}>};
const discarded=(pass.discardedBoxes||[]).map(box=>String(box.text||""));
assert.ok(discarded.includes("BACKGROUND"));
assert.ok(!discarded.some(text=>text.includes("TOTAL")||text.includes("PAGAR")||text.includes("14,60")));

console.log("OCR financial summary row tests OK · fila TOTAL A PAGAR preservada fuera del corredor, total validado y ruido exterior descartado");
