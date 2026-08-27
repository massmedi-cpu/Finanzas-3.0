import assert from "node:assert/strict";
import { recognizeTicketImage } from "../lib/document/ticket-ocr-engine";
import { inferDocumentMetadata, normalizeOcrText } from "../lib/document/ticket-ocr";
import { RECEIPT_OCR_METHOD_PREFIX, RECEIPT_OCR_REVISION } from "../lib/document/receipt-ocr-revision";

const receipt=`CAFETERIA CENTRAL\n21/08/2026 18:42\nDESCRIPCION UDS PRECIO TOTAL\nCAFE 1 2.50 2.50\nTOSTADA 2 2.50 5.00\nBase 6.82\nIVA 0.68\nTOTAL 7.50`;
const metadata=inferDocumentMetadata(receipt,"receipt");
assert.equal(metadata.documentType,"receipt");
assert.equal(metadata.documentDate,"2026-08-21");
assert.equal(metadata.amount,7.5);
assert.equal(metadata.merchant,"CAFETERIA CENTRAL");
assert.ok(normalizeOcrText("  CAFETERIA   CENTRAL  ").includes("CAFETERIA CENTRAL"));

const item=(text:string,left:number,top:number,width:number,score=.98)=>({
  text,
  score,
  poly:[[left,top],[left+width,top],[left+width,top+20],[left,top+20]],
});

const fakePaddleResult={
  image:{width:1000,height:420},
  items:[
    item("CAFETERIA CENTRAL",160,20,300),
    item("21/08/2026 18:42",170,55,270),
    item("DESCRIPCION",80,100,210),item("UDS",560,100,55),item("PRECIO",675,100,80),item("TOTAL",825,100,75),
    item("CAFE",80,145,100),item("1",575,145,20),item("2.50",690,145,55),item("2.50",825,145,55),
    item("TOSTADA",80,185,135),item("2",575,185,20),item("2.50",690,185,55),item("5.00",825,185,55),
    item("Base",680,250,70),item("6.82",825,250,55),
    item("IVA",690,285,55),item("0.68",825,285,55),
    item("TOTAL",665,325,85),item("7.50",825,325,55),
    item("Gracias",430,370,100),
  ],
  metrics:{detMs:120,recMs:170,totalMs:290,detectedBoxes:20,recognizedCount:20},
  runtime:{backend:"wasm",provider:"wasm"},
};

let predictCalls=0;
const engine={
  async predict(){predictCalls+=1;return [fakePaddleResult];},
};
const file=new File([new Uint8Array([1,2,3])],"receipt.jpg",{type:"image/jpeg"});
const progress:Array<[number,string]>=[];
const result=await recognizeTicketImage(file,engine,(value,label)=>progress.push([value,label]),"receipt");

assert.equal(predictCalls,1,"El OCR canónico debe ejecutar una única inferencia sobre el original");
assert.equal(result.method,`${RECEIPT_OCR_METHOD_PREFIX}ppocrv6_es_geometry`);
assert.equal(RECEIPT_OCR_REVISION,"paddle_layout_v2");
assert.equal(result.metadata?.merchant,"CAFETERIA CENTRAL");
assert.equal(result.metadata?.documentDate,"2026-08-21");
assert.equal(result.metadata?.amount,7.5);
assert.equal(result.validation?.status,"complete");
assert.equal(result.receiptLayout?.items.length,2);
assert.deepEqual(result.receiptLayout?.items.map(row=>[row.description,row.quantity,row.unitPrice,row.total]),[
  ["CAFE","1","2,50","2,50"],
  ["TOSTADA","2","2,50","5,00"],
]);
assert.equal(result.receiptLayout?.summary.at(-1)?.value,"7.50");
assert.ok(result.rawText.includes("CAFETERIA CENTRAL"));
assert.ok(result.rawText.includes("TOSTADA"));
assert.equal(result.metrics?.secondaryMs,0,"No puede existir una segunda pasada OCR de rescate");
assert.equal(result.metrics?.preprocessMs,0,"No puede reutilizarse el preprocesado destructivo anterior");
const pass=result.passes[0] as typeof result.passes[0]&{visualLayout?:{lines?:unknown[];bounds?:{width:number;height:number}}};
assert.ok(pass.visualLayout);
assert.equal(pass.visualLayout?.lines?.length,fakePaddleResult.items.length);
assert.ok((pass.visualLayout?.bounds?.width||0)>0);
assert.ok((pass.visualLayout?.bounds?.height||0)>0);
assert.ok(progress.some(([,label])=>label.includes("PP-OCRv6")));

console.log("ticket-ocr PP-OCRv6 geometry tests OK");
