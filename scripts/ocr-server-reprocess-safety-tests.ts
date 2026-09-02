import assert from "node:assert/strict";
import { buildStoredReceiptPersistence, storedReceiptFieldChanges, type StoredArchiveOcrDocument } from "../lib/document/server-archive-ocr-reprocess";
import type { ImageOcrResult } from "../lib/document/ticket-ocr";

const baseExisting:StoredArchiveOcrDocument={
  documentType:"invoice",
  documentDate:"2026-08-28",
  amount:679.2,
  merchant:"Rfoan",
  ocrText:"ALBARAN\nSUBTOTAL 679,20",
  ocrStatus:"needs_review",
  ocrData:{normalizedText:"ALBARAN\nSUBTOTAL 679,20",method:"image_ocr_receipt_v501:paddle_layout_v6:parser_v3:ppocrv6_es_geometry"},
  digitalReconstruction:{documentType:"invoice",documentDate:"2026-08-28",amount:679.2,merchant:"Rfoan"},
};

const result:ImageOcrResult={
  text:"JUAN\nFACTURA 1\nTOTAL 821,83",
  rawText:"JUAN\nFACTURA 1\nTOTAL 821,83",
  normalizedText:"JUAN\nFACTURA 1\nTOTAL 821,83",
  layoutText:"JUAN\nFACTURA 1\nTOTAL 821,83",
  tsv:"",
  confidence:92,
  method:"image_ocr_receipt_v501:paddle_layout_v6:parser_v5:ppocrv6_es_geometry",
  passes:[{variant:"ppocrv6_es_geometry",confidence:92,score:92,visualLayout:{version:1}} as never],
  receiptLayout:{header:["JUAN"],items:[],summary:[{label:"TOTAL",value:"821,83"}],footer:[],unparsedBody:[],source:"geometry_tsv"},
  metadata:{documentType:"invoice",documentDate:"2026-08-29",amount:821.83,merchant:"JUAN",lines:["JUAN","TOTAL 821,83"]},
  validation:{status:"complete",confidence:1,printedTotal:821.83,itemSum:null,base:null,tax:null,basePlusTax:null,validItems:0,invalidItems:0,unparsedBodyRows:0,contradictions:[]},
  metrics:{preprocessMs:0,primaryMs:1000,secondaryMs:0,reconstructionMs:20,totalMs:1020},
};

const machineOwned=buildStoredReceiptPersistence(baseExisting,result,"2026-09-02T05:00:00.000Z");
assert.equal(machineOwned.documentDate,"2026-08-29");
assert.equal(machineOwned.amount,821.83);
assert.equal(machineOwned.merchant,"JUAN");
assert.equal(machineOwned.ocrText,result.text);
assert.equal(machineOwned.ocrStatus,"complete");
assert.deepEqual(machineOwned.humanFieldsPreserved,[]);
assert.equal(machineOwned.digitalReconstruction.amount,821.83,"La reconstrucción debe conservar la nueva inferencia de máquina");
assert.equal(machineOwned.ocrData.bulkReprocessed,true);
assert.equal(machineOwned.ocrData.sourceOriginal,true);
assert.deepEqual(storedReceiptFieldChanges(baseExisting,machineOwned),[
  {field:"documentDate",kind:"updated"},
  {field:"amount",kind:"updated"},
  {field:"merchant",kind:"updated"},
],"El resumen debe describir únicamente cambios reales en metadatos visibles");

const unresolvedResult:ImageOcrResult={
  ...result,
  text:"ALBARAN\nSUBTOTAL 679,20\n821,830",
  rawText:"ALBARAN\nSUBTOTAL 679,20\n821,830",
  normalizedText:"ALBARAN\nSUBTOTAL 679,20\n821,830",
  layoutText:"ALBARAN\nSUBTOTAL 679,20\n821,830",
  metadata:{documentType:"invoice",documentDate:"2026-08-28",amount:null,merchant:null,lines:["ALBARAN","SUBTOTAL 679,20","821,830"]},
  validation:{status:"needs_review",confidence:.45,printedTotal:null,itemSum:null,base:679.2,tax:null,basePlusTax:null,validItems:0,invalidItems:0,unparsedBodyRows:1,contradictions:["missing_total"]},
};
const clearedMachineFields=buildStoredReceiptPersistence(baseExisting,unresolvedResult,"2026-09-02T05:01:00.000Z");
assert.equal(clearedMachineFields.amount,null,"Un subtotal automático anterior debe poder retirarse cuando parser_v5 ya no lo considera total");
assert.equal(clearedMachineFields.merchant,null,"Un comercio automático débil también puede retirarse si la nueva lectura no lo respalda");
assert.equal(clearedMachineFields.ocrStatus,"needs_review");
assert.deepEqual(storedReceiptFieldChanges(baseExisting,clearedMachineFields),[
  {field:"amount",kind:"cleared"},
  {field:"merchant",kind:"cleared"},
],"La recuperación debe hacer visible cuándo retira metadatos automáticos no confirmados");

const edited:StoredArchiveOcrDocument={
  ...baseExisting,
  amount:800,
  merchant:"COMERCIO REVISADO",
  ocrText:"TEXTO CORREGIDO MANUALMENTE",
};
const preserved=buildStoredReceiptPersistence(edited,result,"2026-09-02T05:00:00.000Z");
assert.equal(preserved.amount,800,"Un importe humano distinto de la reconstrucción anterior debe preservarse");
assert.equal(preserved.merchant,"COMERCIO REVISADO","Un comercio humano debe preservarse");
assert.equal(preserved.ocrText,"TEXTO CORREGIDO MANUALMENTE","El texto OCR editado no puede pisarse");
assert.equal(preserved.documentDate,"2026-08-29","Los campos que siguen siendo de máquina sí pueden actualizarse");
assert.equal(preserved.ocrStatus,"needs_review","La presencia de una corrección humana pendiente impide auto-validar");
assert.ok(preserved.humanFieldsPreserved.includes("amount"));
assert.ok(preserved.humanFieldsPreserved.includes("merchant"));
assert.ok(preserved.humanFieldsPreserved.includes("ocrText"));
assert.equal(preserved.digitalReconstruction.amount,821.83,"La huella de máquina debe seguir separada de la edición humana");
assert.equal(preserved.digitalReconstruction.merchant,"JUAN");
assert.deepEqual(storedReceiptFieldChanges(edited,preserved),[
  {field:"documentDate",kind:"updated"},
],"Los campos humanos preservados no pueden presentarse como cambios automáticos");

const missingPrevious:StoredArchiveOcrDocument={...baseExisting,digitalReconstruction:null,merchant:"NO PISAR"};
const conservative=buildStoredReceiptPersistence(missingPrevious,result);
assert.equal(conservative.merchant,"NO PISAR","Sin huella previa, un valor existente se conserva de forma conservadora");
assert.equal(conservative.ocrStatus,"needs_review");

console.log("OCR server reprocess safety tests OK · huella de máquina separada, cambios visibles, retiros seguros, correcciones humanas preservadas y auto-validación bloqueada cuando procede");
