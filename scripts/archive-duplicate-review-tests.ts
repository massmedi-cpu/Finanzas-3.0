import assert from "node:assert/strict";
import fs from "node:fs";
import {detectArchiveDuplicateCandidates,duplicateDocumentCanBeDeleted,merchantOverlap} from "../lib/document/archive-duplicate-detection";
import type {ArchiveDocument} from "../lib/financial/archive";

function doc(id:string,overrides:Partial<ArchiveDocument>={}):ArchiveDocument{
  return {
    id,fileName:`${id}.jpg`,mimeType:"image/jpeg",storageProvider:"supabase_storage",storageUrl:null,storagePath:`documents/${id}.jpg`,fileSize:1000000,contentHash:`hash-${id}`,
    documentType:"receipt",documentDate:"2026-08-22",amount:17.5,merchant:"Comercio Central",ocrStatus:"complete",lifecycleState:"archived",pendingReasons:[],hasOcrText:true,hasReconstruction:true,notes:null,archivedAt:"2026-08-23T00:00:00Z",createdAt:"2026-08-22T00:00:00Z",updatedAt:"2026-08-23T00:00:00Z",links:[],suggestions:[],
    ...overrides,
  };
}

const exact=detectArchiveDuplicateCandidates([
  doc("a",{contentHash:"same"}),doc("b",{contentHash:"same",fileSize:2000000,documentDate:"2026-08-23",amount:99,merchant:"Otro"}),
]);
assert.equal(exact.length,1);
assert.equal(exact[0].confidence,"exact");
assert.ok(exact[0].reasons.includes("same_hash"));

const high=detectArchiveDuplicateCandidates([
  doc("a",{contentHash:"hash-a",merchant:"Ávila Bar"}),
  doc("b",{contentHash:"hash-b",merchant:"Texto OCR degradado distinto"}),
]);
assert.equal(high.length,1);
assert.equal(high[0].confidence,"high");
assert.ok(high[0].reasons.includes("same_date")&&high[0].reasons.includes("same_amount")&&high[0].reasons.includes("same_size"));

const possible=detectArchiveDuplicateCandidates([
  doc("a",{fileSize:900000,merchant:"Cafetería Aurora Centro"}),
  doc("b",{fileSize:1200000,merchant:"Aurora Centro S.L."}),
]);
assert.equal(possible.length,1);
assert.equal(possible[0].confidence,"possible");
assert.ok(merchantOverlap("Cafetería Aurora Centro","Aurora Centro S.L.")>=0.6);

const separate=detectArchiveDuplicateCandidates([
  doc("a",{fileSize:900000,merchant:"Comercio Uno"}),
  doc("b",{fileSize:1200000,merchant:"Comercio Dos"}),
]);
assert.equal(separate.length,0,"La misma fecha e importe no bastan para acusar duplicidad si tamaño y comercio no corroboran");

assert.equal(duplicateDocumentCanBeDeleted(doc("free")),true);
assert.equal(duplicateDocumentCanBeDeleted(doc("linked",{links:[{sourceId:"TX-1",date:null,amount:null,concept:null,counterparty:null}]})),false,"Un documento vinculado debe quedar protegido frente a borrado desde duplicados");

const client=fs.readFileSync("app/archivo/duplicados/duplicate-review-client.tsx","utf8");
const page=fs.readFileSync("app/archivo/duplicados/page.tsx","utf8");
const archivePage=fs.readFileSync("app/archivo/page.tsx","utf8");
for(const token of ["Compara los dos originales antes de borrar","Nunca se elimina un duplicado automáticamente","Vinculado · no se puede borrar","window.confirm","?original=1"])assert.ok(client.includes(token),`La revisión de duplicados debe conservar la barrera de seguridad: ${token}`);
assert.ok(client.includes('method:"DELETE"'),"La eliminación debe reutilizar el endpoint canónico de Archivo");
assert.ok(page.includes("getCompleteArchiveOverview")&&page.includes("detectArchiveDuplicateCandidates"),"La vista debe revisar todo el Archivo, no una página parcial");
assert.ok(archivePage.includes('href="/archivo/duplicados"'),"Archivo debe exponer una entrada visible a la revisión de duplicados");

console.log("Archive duplicate review tests OK · exact/high/possible separados, sin autoborrado y documentos vinculados protegidos");
