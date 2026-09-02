import assert from "node:assert/strict";
import fs from "node:fs";
import { operationalOcrStatus,hasUsefulOcrText } from "../lib/document/ocr-operational-status";

assert.equal(operationalOcrStatus("complete","TICKET TOTAL 12,50"),"complete","Validación completa debe seguir completa");
assert.equal(operationalOcrStatus("needs_review","TICKET PARCIAL"),"needs_review","Una lectura dudosa debe seguir en revisión");
assert.equal(operationalOcrStatus("failed","TEXTO OCR LEGIBLE PERO SIN ESTRUCTURA"),"needs_review","Fallo estructural con evidencia OCR útil no es fallo del motor");
assert.equal(operationalOcrStatus(undefined,"TEXTO OCR UTIL SIN ESTADO DE VALIDACION"),"needs_review","Texto OCR útil sin estado de validación también debe quedar a revisión");
assert.equal(operationalOcrStatus("failed","   \n\t"),"failed","Sin evidencia útil el fallo debe conservarse");
assert.equal(hasUsefulOcrText("12345678"),true);
assert.equal(hasUsefulOcrText("1234567"),false);

const route=fs.readFileSync("app/api/archive/[id]/route.ts","utf8");
assert.ok(route.includes('from "@/lib/document/ocr-operational-status"'),"La API de Archivo debe usar el traductor canónico de estado OCR");
assert.ok(route.includes("operationalOcrStatus(validation.status,rawText)"),"La API debe separar validación financiera de estado operativo OCR");
assert.ok(!route.includes("next.ocrStatus=validation.status"),"La API no puede volver a copiar directamente validation.status a ocrStatus");

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
assert.ok(client.includes('ocrStatus:\"failed\"')&&client.includes("ocrError instanceof Error"),"Un fallo real del motor debe seguir persistiendo como failed");
assert.ok(client.includes("if(!text.trim())throw new Error"),"La ausencia real de texto debe seguir siendo un error OCR");

const migration=fs.readFileSync("database/FINANCIAL_APP_9.0.0_OCR_OPERATIONAL_STATUS_SEMANTICS.sql","utf8");
for(const token of [
  "ocr_status='failed'",
  "ocr_status='needs_review'",
  "like 'image_ocr_receipt_%'",
  "validation'->>'status','')='failed'",
  "rawText",
  ">=8",
  "ocr_data->>'error'",
  "archived_at is null",
])assert.ok(migration.includes(token),`La migración OCR debe conservar la guarda: ${token}`);
for(const forbidden of ["document_date=","amount=","merchant=","ocr_text=","ocr_data="])
  assert.ok(!migration.includes(forbidden),`La reclasificación no puede modificar evidencia o metadatos financieros: ${forbidden}`);

console.log("OCR operational status tests OK · validación estructural fallida con texto útil => needs_review; fallo real/no-text => failed");
