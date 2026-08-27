import assert from "node:assert/strict";
import {
  estimateDeskewFromSamples,
  extractReceiptTotal,
  inferDocumentMetadata,
  normalizeOcrText,
  reconcileReceiptSummary,
  reconstructTsvReceipt,
  scoreReceiptCandidate,
  shouldRefineReceiptCandidates,
} from "../lib/document/ticket-ocr-geometry";
import { detectReceiptTextBounds, mergeReceiptTexts } from "../lib/document/ticket-ocr-engine";
import { parseReceiptLayout, parseReceiptTsvLayout, receiptLayoutTotal } from "../lib/document/receipt-layout";

const tobacco=inferDocumentMetadata(`ESTANCO LOS PRINCIPES\nC/ PRINCIPES 12 SEVILLA\nNIF B12345678\n21/08/2026 18:42\nTABACO 8,50 €\nTOTAL A PAGAR 8,50 €\nTARJETA 8,50 €`,"receipt");
assert.equal(tobacco.documentType,"receipt");assert.equal(tobacco.documentDate,"2026-08-21");assert.equal(tobacco.amount,8.5);assert.equal(tobacco.merchant,"ESTANCO LOS PRINCIPES");

const restaurantText=`MI RESTAURANTE\nHora : 2026-07-11 16:41:59\nMesa : TERRAZA-13\nCamarero : ADMIN\nDESCRIPCION UDS PRECIO TOTAL\nCAÑA GRANDE 3 2.80 8.40\nCORTADA 4 1.80 7.20\nCOPA DE VINO 1 2.50 2.50\nHAMBURGUESA CLASI 1 7.00 7.00\nHAMBURGUESA ESP CA 1 8.00 8.00\nSERRANITO DE POLLO 1 6.00 6.00\nCUBATA 1 5.50 5.50\nBase imponible : 40.55\nIVA (10%) : 4.05\nTOTAL: 44.60 EUR\nPENDIENTE`;
const restaurant=inferDocumentMetadata(restaurantText,"receipt");assert.equal(restaurant.documentDate,"2026-07-11");assert.equal(restaurant.amount,44.6);assert.equal(restaurant.merchant,"MI RESTAURANTE");
const textLayout=parseReceiptLayout(restaurantText);assert.equal(textLayout.items.length,7);assert.deepEqual(textLayout.items[0],{description:"CAÑA GRANDE",quantity:"3",unitPrice:"2,80",total:"8,40"});

const cleaned=normalizeOcrText("|||\n  ESTANCO   LOS PRINCIPES  \n@@@\nTOTAL 8,50 €");assert.ok(cleaned.includes("ESTANCO LOS PRINCIPES"));assert.ok(!cleaned.includes("@@@"));
const basicTsv=["level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext","5\t1\t1\t1\t1\t1\t100\t20\t80\t25\t91\tMI","5\t1\t1\t1\t1\t2\t190\t20\t180\t25\t94\tRESTAURANTE","5\t1\t1\t1\t2\t1\t100\t100\t85\t25\t93\tTOTAL:","5\t1\t1\t1\t2\t2\t260\t100\t50\t25\t90\t44","5\t1\t1\t1\t2\t3\t325\t100\t40\t25\t89\t60","5\t1\t1\t1\t2\t4\t380\t100\t55\t25\t95\tEUR"].join("\n");
const structured=reconstructTsvReceipt(basicTsv);assert.ok(structured);assert.ok(structured.text.includes("MI RESTAURANTE"));assert.ok(structured.text.includes("44,60"));

const skewSamples:Array<{x:number;y:number}>=[];const skewDegrees=3;const slope=Math.tan(skewDegrees*Math.PI/180);for(let line=0;line<7;line+=1)for(let x=20;x<=780;x+=8)skewSamples.push({x,y:40+line*60+slope*x});
const estimated=estimateDeskewFromSamples(skewSamples,800,520);assert.ok(Math.abs(estimated-skewDegrees)<=0.5,`deskew esperado ≈${skewDegrees}°, obtenido ${estimated}°`);

const noisy=`MI RESTAURANTE\nHora : 2026-07-11 16.41.59\nCATA GRADE 3 280 8.40\nCORTADA 4 1.80 7.20\nCOPA DE VINO 1 2.50 2.50\nTOTAL: 44.60 EUR`;
assert.ok(scoreReceiptCandidate(noisy,74,"receipt")>scoreReceiptCandidate("",95,"receipt"));assert.equal(shouldRefineReceiptCandidates([{text:noisy,confidence:74},{text:"",confidence:95}],"receipt"),true);
const sparse=`MI RESTAURANTE\nHora 2026-07-11 16:41:59\nCAÑA GRANDE 3 2.80 8.40\nCORTADA 4 1.80 7.20\nCOPA DE VINO 1 2.50 2.50\nTOTAL 44.60 EUR`;
const consensus=mergeReceiptTexts(noisy,sparse);assert.ok(consensus.includes("CAÑA GRANDE 3 2.80 8.40"));assert.equal(inferDocumentMetadata(consensus,"receipt").amount,44.6);

const avilaBad=`Avila Bar - Victoria Kent\nRazon Social: Luis Enrique Ramirez Mendoza\nDireccion: Calle Victoria Kent\nTelefono: +34 641592438\nHora: 2028-08-22 00.02.03\nDESCRIPCION UDS PRECIO IMPORTE\nENERGY 1 1.80 1.80`;
const avilaBadMeta=inferDocumentMetadata(avilaBad,"receipt");assert.equal(avilaBadMeta.amount,null,"una hora o línea parcial nunca debe inventar el total");assert.equal(avilaBadMeta.documentDate,null,"un ticket no admite fecha futura imposible");assert.equal(avilaBadMeta.merchant,"Avila Bar - Victoria Kent");

const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const rows=[
"5\t1\t1\t1\t1\t1\t100\t145\t170\t24\t96\tDESCRIPCION","5\t1\t1\t1\t1\t2\t560\t145\t50\t24\t96\tUDS","5\t1\t1\t1\t1\t3\t670\t145\t78\t24\t96\tPRECIO","5\t1\t1\t1\t1\t4\t800\t145\t92\t24\t96\tIMPORTE",
"5\t1\t1\t1\t2\t1\t100\t190\t95\t23\t92\tENERGY","5\t1\t1\t1\t2\t2\t575\t190\t18\t23\t95\t1","5\t1\t1\t1\t2\t3\t688\t190\t52\t23\t95\t1.80","5\t1\t1\t1\t2\t4\t820\t190\t52\t23\t95\t1.80",
"5\t1\t1\t1\t3\t1\t100\t230\t72\t23\t92\tTERCIO","5\t1\t1\t1\t3\t2\t180\t230\t82\t23\t92\tGALICIA","5\t1\t1\t1\t3\t3\t270\t230\t60\t23\t91\tCERO","5\t1\t1\t1\t3\t4\t575\t230\t18\t23\t95\t1","5\t1\t1\t1\t3\t5\t688\t230\t52\t23\t95\t2.80","5\t1\t1\t1\t3\t6\t820\t230\t52\t23\t95\t2.80",
"5\t1\t1\t1\t4\t1\t100\t270\t70\t23\t92\tCAÑA","5\t1\t1\t1\t4\t2\t180\t270\t82\t23\t92\tGRANDE","5\t1\t1\t1\t4\t3\t575\t270\t18\t23\t95\t2","5\t1\t1\t1\t4\t4\t688\t270\t52\t23\t95\t2.80","5\t1\t1\t1\t4\t5\t820\t270\t52\t23\t95\t5.60",
"5\t1\t1\t1\t5\t1\t100\t310\t72\t23\t92\tCUBATA","5\t1\t1\t1\t5\t2\t575\t310\t18\t23\t95\t1","5\t1\t1\t1\t5\t3\t688\t310\t52\t23\t95\t5.50","5\t1\t1\t1\t5\t4\t820\t310\t52\t23\t95\t5.50",
"5\t1\t1\t1\t6\t1\t100\t350\t70\t23\t92\tAGUA","5\t1\t1\t1\t6\t2\t180\t350\t55\t23\t92\tCON","5\t1\t1\t1\t6\t3\t245\t350\t55\t23\t92\tGAS","5\t1\t1\t1\t6\t4\t575\t350\t18\t23\t95\t1","5\t1\t1\t1\t6\t5\t688\t350\t52\t23\t95\t1.80","5\t1\t1\t1\t6\t6\t820\t350\t52\t23\t95\t1.80",
"5\t1\t1\t1\t7\t1\t650\t430\t75\t23\t96\tTOTAL","5\t1\t1\t1\t7\t2\t810\t430\t65\t23\t96\t17.50"
];
const avilaTsv=[header,...rows].join("\n");const geo=parseReceiptTsvLayout(avilaTsv);assert.ok(geo);assert.equal(geo.items.length,5);assert.equal(geo.items[0].description,"ENERGY");assert.equal(geo.items[2].description,"CAÑA GRANDE");assert.equal(receiptLayoutTotal(geo),17.5,"TOTAL 17,50 debe prevalecer sobre horas y subtotales");
const bounds=detectReceiptTextBounds(avilaTsv,1000,600);assert.ok(bounds.width>500&&bounds.height>200,"el localizador debe conservar el bloque de texto del ticket");

const damagedRows=[
"5\t1\t1\t1\t1\t1\t100\t145\t170\t24\t96\tDESCRIPCION","5\t1\t1\t1\t1\t2\t560\t145\t50\t24\t82\tUOS","5\t1\t1\t1\t1\t3\t670\t145\t78\t24\t96\tPRECIO","5\t1\t1\t1\t1\t4\t800\t145\t92\t24\t45\tTHPRTE",
"5\t1\t1\t1\t2\t1\t100\t190\t95\t23\t92\tENERGY","5\t1\t1\t1\t2\t2\t688\t190\t52\t23\t95\t1.80","5\t1\t1\t1\t2\t3\t820\t190\t52\t23\t95\t1.80",
"5\t1\t1\t1\t3\t1\t100\t230\t72\t23\t92\tTERCIO","5\t1\t1\t1\t3\t2\t180\t230\t82\t23\t92\tGALICIA","5\t1\t1\t1\t3\t3\t270\t230\t60\t23\t91\tCERO","5\t1\t1\t1\t3\t4\t688\t230\t52\t23\t95\t2.80","5\t1\t1\t1\t3\t5\t820\t230\t52\t23\t95\t2.80",
"5\t1\t1\t1\t4\t1\t100\t270\t70\t23\t92\tCAÑA","5\t1\t1\t1\t4\t2\t180\t270\t82\t23\t92\tGRANDE","5\t1\t1\t1\t4\t3\t575\t270\t18\t23\t95\t2","5\t1\t1\t1\t4\t4\t688\t270\t52\t23\t95\t2.80","5\t1\t1\t1\t4\t5\t820\t270\t52\t23\t95\t5.60",
"5\t1\t1\t1\t5\t1\t100\t310\t72\t23\t92\tCUBATA","5\t1\t1\t1\t5\t2\t688\t310\t52\t23\t95\t5.50","5\t1\t1\t1\t5\t3\t820\t310\t52\t23\t95\t5.50",
"5\t1\t1\t1\t6\t1\t100\t350\t70\t23\t92\tAGUA","5\t1\t1\t1\t6\t2\t180\t350\t55\t23\t92\tCON","5\t1\t1\t1\t6\t3\t245\t350\t55\t23\t92\tGAS","5\t1\t1\t1\t6\t4\t688\t350\t52\t23\t95\t1.80","5\t1\t1\t1\t6\t5\t820\t350\t52\t23\t95\t1.80",
"5\t1\t1\t1\t7\t1\t650\t430\t75\t23\t96\tTotal:","5\t1\t1\t1\t7\t2\t810\t430\t65\t23\t96\t17.50"
];
const damaged=parseReceiptTsvLayout([header,...damagedRows].join("\n"));assert.ok(damaged);assert.equal(damaged.items.length,5,"una cabecera UOS/THPRTE no puede hacer desaparecer productos legibles");assert.deepEqual(damaged.items.map(item=>item.quantity),["1","1","2","1","1"],"las cantidades omitidas por OCR se recuperan solo cuando precio × cantidad coincide");assert.equal(receiptLayoutTotal(damaged),17.5);assert.equal(extractReceiptTotal("Total IVA 1,59\nTotal: 1750"),17.5,"un total sin separador decimal se repara dentro de la zona Total");
assert.deepEqual(reconcileReceiptSummary([{label:"Base",value:"5.91"},{label:"Total IVA",value:"1.59"}],17.5),[{label:"Base",value:"15.91"},{label:"Total IVA",value:"1.59"},{label:"Total",value:"17.50"}],"Base debe repararse solo cuando IVA y Total demuestran el dígito perdido");
console.log("ticket-ocr-v302-tests OK · lectura adaptativa rápida · cinco líneas Ávila · total/fecha/comercio protegidos · 17,50 €");
