import assert from "node:assert/strict";
import { inferReceiptTextCorridor, type ReceiptCorridorRow } from "../lib/document/receipt-text-corridor";
import { recognizeTicketImage } from "../lib/document/ticket-ocr-engine";

const row = (text:string,left:number,right:number,top:number,score=92):ReceiptCorridorRow => ({
  text, score, left, right, top, bottom:top+26,
});

const simple=[
  row("CAFETERIA CENTRAL",330,670,80),
  row("Calle Ejemplo 12",350,650,120),
  row("CAFE              1,40",260,720,220),
  row("TOSTADA           2,10",250,725,265),
  row("ZUMO              2,50",265,718,310),
  row("TOTAL             6,00",430,725,390),
  row("GRACIAS",420,580,470),
  row("PUBLICIDAD LATERAL",20,190,245,96),
  row("OTRO TEXTO DEL FONDO",805,990,335,94),
];
const simpleCorridor=inferReceiptTextCorridor(simple,1000,700);
assert.ok(simpleCorridor,"un ticket simple sin cabecera semántica debe generar corredor geométrico");
assert.ok(simpleCorridor.left>190,"el texto lateral izquierdo del fondo debe quedar fuera");
assert.ok(simpleCorridor.right<805,"el texto lateral derecho del fondo debe quedar fuera");
assert.ok(simpleCorridor.left<270&&simpleCorridor.right>720,"el cuerpo completo del ticket debe permanecer dentro");

const offCenter=[
  row("TIENDA",120,360,60),
  row("A 1,20",90,405,150),
  row("B 2,40",85,410,205),
  row("C 0,90",95,400,260),
  row("D 4,10",92,408,315),
  row("TOTAL 8,60",170,410,390),
  row("GRACIAS",165,340,455),
  row("CARTEL DEL FONDO",700,970,220),
  row("TEXTO EXTERIOR",720,965,310),
];
const offCenterCorridor=inferReceiptTextCorridor(offCenter,1000,650);
assert.ok(offCenterCorridor,"el ticket no tiene que estar centrado en la fotografía");
assert.ok(offCenterCorridor.center<420,"el eje debe seguir al ticket desplazado, no al centro de la imagen");
assert.ok(offCenterCorridor.right<700,"el bloque de fondo distante debe excluirse");

const broadBackground=[
  row("NEGOCIO",350,650,55),
  row("LINEA UNO",300,700,150),
  row("LINEA DOS",295,705,205),
  row("LINEA TRES",305,698,260),
  row("LINEA CUATRO",300,700,315),
  row("TOTAL 12,30",430,705,390),
  row("GRACIAS",420,580,460),
  row("UN CARTEL MUY ANCHO DETRAS DEL TICKET",30,960,290,99),
];
const broadCorridor=inferReceiptTextCorridor(broadBackground,1000,650);
assert.ok(broadCorridor,"una sola línea ancha del fondo no debe arrastrar el corredor");
assert.ok(broadCorridor.left>100&&broadCorridor.right<900);

const splitClusters=[
  row("A1",80,260,80),row("A2",80,260,160),row("A3",80,260,240),row("A4",80,260,320),row("A5",80,260,400),
  row("B1",740,920,85),row("B2",740,920,165),row("B3",740,920,245),row("B4",740,920,325),row("B5",740,920,405),
];
assert.equal(
  inferReceiptTextCorridor(splitClusters,1000,600),
  null,
  "dos bloques equivalentes no deben forzar una elección insegura",
);

assert.equal(
  inferReceiptTextCorridor([row("A",300,500,100),row("B",300,500,180),row("C",300,500,260)],1000,600),
  null,
  "con pocas filas el filtro debe fallar de forma cerrada",
);

// Un único texto alineado con el ticket pero pegado al borde superior/inferior
// solo se excluye si queda separado del cuerpo por un hueco extraordinario.
const verticalBackground=[
  row("ANUNCIO SUPERIOR",330,670,20,97),
  row("NEGOCIO",350,650,250),
  row("LINEA UNO 1,00",290,710,305),
  row("LINEA DOS 2,00",285,715,360),
  row("LINEA TRES 3,00",290,710,415),
  row("TOTAL 6,00",430,710,480),
  row("GRACIAS",420,580,545),
  row("TOTAL 99,99",390,690,850,98),
];
const verticalCorridor=inferReceiptTextCorridor(verticalBackground,1000,900);
assert.ok(verticalCorridor);
assert.equal(verticalCorridor.verticalLimited,true,"dos filas extremas claramente aisladas deben activar el envolvente vertical");
assert.ok(verticalCorridor.top>46,"el texto superior del fondo debe quedar por encima del envolvente");
assert.ok(verticalCorridor.bottom<850,"el texto inferior del fondo debe quedar por debajo del envolvente");
assert.ok(verticalCorridor.top<250&&verticalCorridor.bottom>571,"el cuerpo real del ticket debe quedar completo dentro del margen");

const legitimateSpacedHeader=[
  row("NEGOCIO REAL",350,650,90),
  row("DIRECCION REAL",330,670,240),
  row("LINEA UNO 1,00",290,710,300),
  row("LINEA DOS 2,00",285,715,355),
  row("LINEA TRES 3,00",290,710,410),
  row("TOTAL 6,00",430,710,475),
  row("GRACIAS",420,580,540),
];
const legitimateCorridor=inferReceiptTextCorridor(legitimateSpacedHeader,1000,900);
assert.ok(legitimateCorridor);
assert.equal(legitimateCorridor.verticalLimited,false,"una cabecera real con separación grande pero no extrema debe conservarse");
assert.equal(legitimateCorridor.top,0);

// Integración: en un ticket sin cabecera, una palabra financiera situada en
// otro papel no puede saltarse el corredor solo por llamarse TOTAL. El total
// del ticket, dentro de su geometría dominante, sí debe conservarse.
const ocrItem=(text:string,left:number,top:number,width:number,score=.94)=>({
  text,
  score,
  poly:[[left,top],[left+width,top],[left+width,top+20],[left,top+20]],
});
const headerlessResult={
  image:{width:1000,height:700},
  items:[
    ocrItem("CAFETERIA CENTRAL",330,60,300),
    ocrItem("03/09/2026 08:00",345,105,270),
    ocrItem("CAFE 1,40",275,200,430),
    ocrItem("TOSTADA 2,10",265,250,445),
    ocrItem("ZUMO 2,50",280,300,420),
    ocrItem("TOTAL 6,00",430,380,275),
    ocrItem("GRACIAS",420,455,165),
    ocrItem("TOTAL 99,99",825,275,150,.97),
  ],
  metrics:{detMs:8,recMs:15,totalMs:23,detectedBoxes:8,recognizedCount:8},
  runtime:"server-tesseract-7",
};
const headerlessEngine={async predict(){return[headerlessResult];}};
const headerlessFile=new File([new Uint8Array([1,2,3])],"headerless.jpg",{type:"image/jpeg"});
const headerlessRecognized=await recognizeTicketImage(headerlessFile,headerlessEngine,()=>undefined,"receipt");
assert.ok(headerlessRecognized.text.includes("TOTAL 6,00"),"el total que pertenece al corredor debe conservarse");
assert.ok(!headerlessRecognized.text.includes("99,99"),"un TOTAL financiero del fondo no debe quedar protegido fuera del corredor inferido");
const discarded=(headerlessRecognized.passes[0] as typeof headerlessRecognized.passes[0]&{discardedBoxes?:Array<{text?:string}>}).discardedBoxes||[];
assert.ok(discarded.some(box=>String(box.text||"").includes("99,99")),"el total exterior debe quedar trazado como evidencia descartada");

const verticalResult={
  image:{width:1000,height:900},
  items:[
    ocrItem("ANUNCIO SUPERIOR",350,20,300,.98),
    ocrItem("CAFETERIA CENTRAL",340,250,320),
    ocrItem("03/09/2026 08:00",350,300,280),
    ocrItem("CAFE 1,40",285,355,420),
    ocrItem("TOSTADA 2,10",280,410,430),
    ocrItem("ZUMO 2,50",290,465,410),
    ocrItem("TOTAL 6,00",430,530,280),
    ocrItem("GRACIAS",420,590,170),
    ocrItem("TOTAL 99,99",390,850,300,.98),
  ],
  metrics:{detMs:8,recMs:15,totalMs:23,detectedBoxes:9,recognizedCount:9},
  runtime:"server-tesseract-7",
};
const verticalEngine={async predict(){return[verticalResult];}};
const verticalFile=new File([new Uint8Array([4,5,6])],"vertical-background.jpg",{type:"image/jpeg"});
const verticalRecognized=await recognizeTicketImage(verticalFile,verticalEngine,()=>undefined,"receipt");
assert.ok(verticalRecognized.text.includes("CAFETERIA CENTRAL")&&verticalRecognized.text.includes("TOTAL 6,00"),"cabecera y total del ticket deben conservarse dentro del envolvente");
assert.ok(!verticalRecognized.text.includes("ANUNCIO SUPERIOR"),"una fila superior aislada del fondo debe descartarse aunque esté centrada");
assert.ok(!verticalRecognized.text.includes("99,99"),"un total inferior aislado del fondo no puede quedar protegido semánticamente");
const verticalDiscarded=(verticalRecognized.passes[0] as typeof verticalRecognized.passes[0]&{discardedBoxes?:Array<{text?:string}>}).discardedBoxes||[];
assert.ok(verticalDiscarded.some(box=>box.text==="ANUNCIO SUPERIOR")&&verticalDiscarded.some(box=>String(box.text||"").includes("99,99")),"ambas filas exteriores deben quedar trazadas como evidencia descartada");

console.log("OCR background corridor tests OK · aislamiento lateral/vertical, totales exteriores rechazados y cabeceras reales protegidas");
