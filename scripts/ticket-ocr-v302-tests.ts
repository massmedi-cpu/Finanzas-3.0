import assert from "node:assert/strict";
import { recognizeTicketImage } from "../lib/document/ticket-ocr-engine";
import { inferDocumentMetadata, normalizeOcrText } from "../lib/document/ticket-ocr";
import { parseReceiptLayout } from "../lib/document/receipt-layout";
import { validateReceiptFinancials } from "../lib/document/receipt-financial-validator";
import { RECEIPT_OCR_METHOD_PREFIX, RECEIPT_OCR_REVISION } from "../lib/document/receipt-ocr-revision";
import { detectPaper } from "../lib/document/receipt-image-preprocessor";

const receipt=`CAFETERIA CENTRAL\n21/08/2026 18:42\nDESCRIPCION UDS PRECIO TOTAL\nCAFE 1 2.50 2.50\nTOSTADA 2 2.50 5.00\nBase 6.82\nIVA 0.68\nTOTAL 7.50`;
const metadata=inferDocumentMetadata(receipt,"receipt");
assert.equal(metadata.documentType,"receipt");
assert.equal(metadata.documentDate,"2026-08-21");
assert.equal(metadata.amount,7.5);
assert.equal(metadata.merchant,"CAFETERIA CENTRAL");
assert.ok(normalizeOcrText("  CAFETERIA   CENTRAL  ").includes("CAFETERIA CENTRAL"));

const commercialDocument=`www.sinfibanda.com\nCami Can Calders 10\n08173 Sant Cugat\nB67148637\n936 565 551\nMETALES MONGAY SL\nC/POLIGONO ELS DOLORS S/N\nMANRESA\nB59107948\nALBARAN Factura Cliente Fecha\n7810018883 F260816162 STC170157 28/08/2026\nCantidad Código Articulo Precio IVA Subtotal\n5,0009745 CHAPA INOX AISI316L\nG:3MM 1000X2000 DECAPADA 125,320 21,00 626,600 S.5\n2,00080122 VENTILADOR HELICOIDAL\nCXV-56/4-6T 1 Vel. 0,75 26,300 21,00 52,600\nPORTES 21,00\n21,00 % IVA sobre 679,20 142,63\nTotal 821,830`;
const commercialLayout=parseReceiptLayout(commercialDocument);
assert.equal(commercialLayout.items.length,2,"Los albaranes con cantidad+código unidos deben reconstruir sus líneas");
assert.deepEqual(commercialLayout.items.map(row=>[row.quantity,row.unitPrice,row.total]),[
  ["5","125,32","626,60"],
  ["2","26,30","52,60"],
]);
assert.ok(commercialLayout.items[0].description.includes("9745"));
assert.ok(commercialLayout.items[1].description.includes("80122"));
assert.deepEqual(commercialLayout.summary.map(row=>[row.label,row.value]),[
  ["Base","679,20"],
  ["IVA","142,63"],
  ["Total","821,83"],
]);
assert.equal(commercialLayout.unparsedBody?.length,0);
const commercialValidation=validateReceiptFinancials(commercialLayout,[commercialDocument]);
assert.equal(commercialValidation.status,"complete","Una factura neta debe validar líneas contra base y base+IVA contra total");
assert.equal(commercialValidation.itemSum,679.2);
assert.equal(commercialValidation.base,679.2);
assert.equal(commercialValidation.tax,142.63);
assert.equal(commercialValidation.printedTotal,821.83);
assert.equal(commercialValidation.contradictions.length,0);
const commercialMetadata=inferDocumentMetadata(commercialDocument,"receipt");
assert.equal(commercialMetadata.documentType,"invoice");
assert.equal(commercialMetadata.documentDate,"2026-08-28");
assert.equal(commercialMetadata.amount,821.83);
assert.equal(commercialMetadata.merchant,"Sinfibanda");

const productionCommercialOcr=`ALBARAN    F\nTELF:955631612-955672144 41500-ALCALA DE GUADAIRA P.I. LAGUNA LARGA C/3 NAVES 16-18 www.SINFIBANDA.net ventas@sinfibanda.net    BUREAU 7828    VEJER DE LA FRONTERA SOC.COOP.AND.DIVINO SALVADOR 11150 CADIZ CTRA-LA MUELA S/N CLIENTE\nVERITAS\nNúmero Albarán L1111 28/08/2026 Fecha    28/08/2026 Fecha Valor  Referéncia Albarán\nB-91349282\nCantidad  Código    Articulo    Precio    IVA    Subtotal\n5,0009745    CHAPA PERF. 2000*1000*4*5 T-8 HIERRO    125,320    21,00  626,600    S.5\n1,0023    PORTES TDN/TXT + PALET 2000*1000    52,600    21,00    52,600\nYEMBALAJE\n08\n0\n6,00\nescuento    Descuento P.Pago % Base Imponible 679,200 Importe IVA 142,630 Importe R.E. Subtotal TOTAL ALBARAN 679,200\nEspecialistas en: -SINFINES - CHAPAS PERFORADAS GRAN STOCK- TODO PARA ELEVACION Y TRANSPORTE    821,830\n-BANDAS ELEVADORAS,CANGILONES PARA BANDA Y TIPO Z -EXPERTOS EN ATEX\nHORARIO DE VERANO :DEL 22 DE JUNIO AL 31 DE AGOSTO 07.00 A 15.00`;
const productionLayout=parseReceiptLayout(productionCommercialOcr);
assert.equal(productionLayout.items.length,2,"La evidencia OCR real de producción debe reconstruir exactamente dos líneas comerciales");
assert.deepEqual(productionLayout.items.map(row=>[row.quantity,row.unitPrice,row.total]),[
  ["5","125,32","626,60"],
  ["1","52,60","52,60"],
]);
assert.ok(productionLayout.items[0].description.includes("9745"));
assert.ok(productionLayout.items[1].description.includes("23"));
assert.deepEqual(productionLayout.summary.map(row=>[row.label,row.value]),[
  ["Base","679,20"],
  ["IVA","142,63"],
  ["Total","821,83"],
]);
assert.equal(productionLayout.unparsedBody?.length,0,"El ruido posterior a las líneas del albarán no puede invalidar el cuerpo financiero");
const productionValidation=validateReceiptFinancials(productionLayout,[productionCommercialOcr]);
assert.equal(productionValidation.status,"complete");
assert.equal(productionValidation.itemSum,679.2);
assert.equal(productionValidation.base,679.2);
assert.equal(productionValidation.tax,142.63);
assert.equal(productionValidation.printedTotal,821.83);
assert.equal(productionValidation.contradictions.length,0);
const productionMetadata=inferDocumentMetadata(productionCommercialOcr,"receipt");
assert.equal(productionMetadata.documentType,"invoice");
assert.equal(productionMetadata.documentDate,"2026-08-28");
assert.equal(productionMetadata.amount,821.83);
assert.equal(productionMetadata.merchant,"Sinfibanda");

const productionPriceOnlyOcr=`JUAN\nC. de Mallorca, 312, L'Eixample, 08037\nBarcelona, Spain\n30/08/2026, 19:21\nQTY Description Price\n1 Café Americano 300\n1 Ensalada de la huerta 82)\n1 Bocadillo de Jamén 160\n1Zumo de Naranja 2,80\nTax 1.4 % 4\nAX) 4 % 4.86\n1460`;
const productionPriceOnlyLayout=parseReceiptLayout(productionPriceOnlyOcr);
assert.deepEqual(productionPriceOnlyLayout.items.map(row=>[row.description,row.quantity,row.unitPrice,row.total]),[
  ["Café Americano","1","3,00","3,00"],
  ["Bocadillo de Jamén","1","1,60","1,60"],
  ["Zumo de Naranja","1","2,80","2,80"],
],"Los tickets con QTY + descripción + un único precio deben recuperar solo importes inequívocos");
assert.ok(productionPriceOnlyLayout.unparsedBody?.some(row=>row.text.includes("Ensalada")),"Una cifra dañada no puede inventarse a partir del total esperado");
assert.ok(productionPriceOnlyLayout.unparsedBody?.some(row=>row.text==="1460"),"Un número final sin etiqueta no puede asumirse como total");
const productionPriceOnlyValidation=validateReceiptFinancials(productionPriceOnlyLayout,[productionPriceOnlyOcr]);
assert.equal(productionPriceOnlyValidation.status,"needs_review","La extracción parcial fiable debe ir a revisión, no marcarse como fallo total");
assert.equal(productionPriceOnlyValidation.itemSum,7.4);
assert.equal(productionPriceOnlyValidation.printedTotal,null);

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
    item("Povered by gamarero.com",350,370,300),
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

assert.equal(predictCalls,1,"El OCR canónico debe ejecutar una única inferencia");
assert.equal(result.method,`${RECEIPT_OCR_METHOD_PREFIX}ppocrv6_es_geometry`);
assert.equal(RECEIPT_OCR_REVISION,"paddle_layout_v6");
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
assert.ok(result.rawText.includes("Povered by gamarero.com"),"La evidencia literal no puede reescribirse");
assert.ok(result.text.includes("Powered by qamarero.com"),"El texto fiable debe corregir la firma inequívoca del TPV");
assert.ok(result.receiptLayout?.footer.includes("Powered by qamarero.com"));
assert.equal(result.metrics?.secondaryMs,0,"No puede existir una segunda pasada OCR de rescate");
assert.equal(result.metrics?.preprocessMs,0,"En Node sin canvas debe conservarse el fallback no destructivo");
const pass=result.passes[0] as typeof result.passes[0]&{visualLayout?:{lines?:unknown[];bounds?:{width:number;height:number}}};
assert.ok(pass.visualLayout);
assert.equal(pass.visualLayout?.lines?.length,fakePaddleResult.items.length);
assert.ok((pass.visualLayout?.bounds?.width||0)>0);
assert.ok((pass.visualLayout?.bounds?.height||0)>0);
assert.ok(progress.some(([,label])=>label.includes("PP-OCRv6")));

const noisyPaddleResult={
  ...fakePaddleResult,
  image:{width:1200,height:560},
  items:[
    ...fakePaddleResult.items,
    item("WOOKISHVAR",1080,150,110,.96),
    item("出88481日日886886815888日8618日88840",420,500,360,.92),
    item("BACKGROUND",1085,190,105,.91),
  ],
};
const noisyEngine={async predict(){return [noisyPaddleResult];}};
const noisy=await recognizeTicketImage(file,noisyEngine,()=>undefined,"receipt");
assert.ok(noisy.rawText.includes("WOOKISHVAR"),"La evidencia literal debe conservar el texto detectado por el motor");
assert.ok(noisy.rawText.includes("886886"),"La evidencia literal debe conservar también la detección espuria");
assert.ok(!noisy.text.includes("WOOKISHVAR"),"El texto fiable no debe incorporar letras del fondo fuera del ticket");
assert.ok(!noisy.text.includes("BACKGROUND"),"La reconstrucción no debe ampliar sus límites por texto del fondo");
assert.ok(!noisy.text.includes("886886"),"La basura de códigos/patrones bajo el cierre debe descartarse");
const noisyPass=noisy.passes[0] as typeof noisy.passes[0]&{discardedBoxCount?:number;visualLayout?:{lines?:Array<{text?:string}>}};
assert.ok((noisyPass.discardedBoxCount||0)>=3);
assert.ok(!(noisyPass.visualLayout?.lines||[]).some(line=>String(line.text||"").includes("WOOKISHVAR")));

const photoWidth=320;const photoHeight=480;const pixels=new Uint8ClampedArray(photoWidth*photoHeight*4);
for(let y=0;y<photoHeight;y+=1){
  const paperLeft=Math.round(46+y*.012);const paperRight=Math.round(247+y*.045);
  for(let x=0;x<photoWidth;x+=1){
    const inside=x>=paperLeft&&x<=paperRight&&y<446;let value=inside?174:x<paperLeft?48:82;
    if(inside&&y>35&&y<410&&y%34<4&&x>paperLeft+18&&x<paperRight-18)value=38;
    if(!inside&&x>paperRight+16&&y%29<5)value=220;
    const offset=(y*photoWidth+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=value;pixels[offset+3]=255;
  }
}
const isolated=detectPaper({data:pixels,width:photoWidth,height:photoHeight,colorSpace:"srgb"} as ImageData,photoWidth,photoHeight);
assert.ok(isolated,"el detector debe aislar un ticket gris aunque haya una superficie con trazos detrás");
assert.ok((isolated?.topLeft||0)>=40&&(isolated?.topLeft||0)<=65);
assert.ok((isolated?.topRight||0)>=225&&(isolated?.topRight||0)<=265);
assert.ok((isolated?.bottom||0)>=420&&(isolated?.bottom||0)<photoHeight);

console.log("ticket-ocr PP-OCRv6 geometry tests OK · tickets y evidencia comercial real de producción");