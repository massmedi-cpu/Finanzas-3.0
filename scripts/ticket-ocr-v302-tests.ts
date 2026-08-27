import assert from "node:assert/strict";
import { inferDocumentMetadata, normalizeOcrText } from "../lib/document/ticket-ocr";
import { parseReceiptLayout, parseReceiptTsvLayout, receiptLayoutTotal, type ReceiptLayout } from "../lib/document/receipt-layout";
import { reconstructReceiptEvidence } from "../lib/document/receipt-reconstruction";
import { validateReceiptFinancials } from "../lib/document/receipt-financial-validator";
import { RECEIPT_OCR_METHOD_PREFIX, RECEIPT_OCR_REVISION } from "../lib/document/receipt-ocr-revision";

const receipt=`CAFETERIA CENTRAL\n21/08/2026 18:42\nDESCRIPCION UDS PRECIO TOTAL\nCAFE 1 2.50 2.50\nTOSTADA 2 2.50 5.00\nBase 6.82\nIVA 0.68\nTOTAL 7.50`;
const metadata=inferDocumentMetadata(receipt,"receipt");
assert.equal(metadata.documentType,"receipt");
assert.equal(metadata.documentDate,"2026-08-21");
assert.equal(metadata.amount,7.5);
assert.equal(metadata.merchant,"CAFETERIA CENTRAL");
assert.ok(normalizeOcrText("  CAFETERIA   CENTRAL  ").includes("CAFETERIA CENTRAL"));

const textLayout=parseReceiptLayout(receipt);
assert.equal(textLayout.items.length,2);
assert.equal(receiptLayoutTotal(textLayout),7.5);
assert.deepEqual(textLayout.summary.map(line=>[line.label,line.value]),[["Base","6.82"],["IVA","0.68"],["TOTAL","7.50"]]);
const validated=validateReceiptFinancials(textLayout,[receipt]);
assert.equal(validated.status,"complete");
assert.equal(validated.itemSum,7.5);
assert.equal(validated.printedTotal,7.5);
assert.equal(validated.basePlusTax,7.5);

const incomplete:ReceiptLayout={
  header:["CAFETERIA CENTRAL"],
  items:[
    {description:"CAFE",quantity:"1",unitPrice:"2.50",total:"2.50",top:100,bottom:120,sourceLine:"CAFE 1 2.50 2.50"},
  ],
  summary:[{label:"Base",value:"6.82"},{label:"IVA",value:"0.68"},{label:"Total",value:"7.50"}],
  footer:["Gracias"],
  unparsedBody:[{text:"TOSTADA 2 2.50 5.00",top:130,bottom:150}],
  source:"geometry_tsv",
};
const incompleteValidation=validateReceiptFinancials(incomplete,[receipt]);
assert.equal(incompleteValidation.status,"needs_review");
assert.ok(incompleteValidation.contradictions.some(item=>item.code==="unparsed_body_rows"));

const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const tsv=[
  header,
  "5\t1\t1\t1\t1\t1\t100\t100\t150\t20\t95\tDESCRIPCION",
  "5\t1\t1\t1\t1\t2\t560\t100\t50\t20\t95\tUDS",
  "5\t1\t1\t1\t1\t3\t670\t100\t70\t20\t95\tPRECIO",
  "5\t1\t1\t1\t1\t4\t800\t100\t80\t20\t95\tTOTAL",
  "5\t1\t1\t1\t2\t1\t100\t140\t80\t20\t94\tCAFE",
  "5\t1\t1\t1\t2\t2\t575\t140\t20\t20\t96\t1",
  "5\t1\t1\t1\t2\t3\t688\t140\t50\t20\t96\t2.50",
  "5\t1\t1\t1\t2\t4\t820\t140\t50\t20\t96\t2.50",
  "5\t1\t1\t1\t3\t1\t100\t180\t90\t20\t94\tTOSTADA",
  "5\t1\t1\t1\t3\t2\t575\t180\t20\t20\t96\t2",
  "5\t1\t1\t1\t3\t3\t688\t180\t50\t20\t96\t2.50",
  "5\t1\t1\t1\t3\t4\t820\t180\t50\t20\t96\t5.00",
  "5\t1\t1\t1\t4\t1\t700\t240\t70\t20\t96\tTOTAL",
  "5\t1\t1\t1\t4\t2\t820\t240\t50\t20\t96\t7.50",
].join("\n");
const geometric=parseReceiptTsvLayout(tsv);
assert.ok(geometric);
assert.equal(geometric.items.length,2);
assert.equal(geometric.items[0].description,"CAFE");
assert.equal(geometric.items[1].description,"TOSTADA");
assert.equal(receiptLayoutTotal(geometric),7.5);

// An OCR quantity that contradicts price × total is not trusted. The parser may
// recover it only when arithmetic uniquely determines an integer quantity.
const noisyQuantityTsv=[
  header,
  "5\t1\t1\t1\t1\t1\t100\t100\t150\t20\t95\tDESCRIPCION",
  "5\t1\t1\t1\t1\t2\t560\t100\t50\t20\t95\tUDS",
  "5\t1\t1\t1\t1\t3\t670\t100\t70\t20\t95\tPRECIO",
  "5\t1\t1\t1\t1\t4\t800\t100\t80\t20\t95\tTOTAL",
  "5\t1\t1\t1\t2\t1\t100\t140\t130\t20\t95\tPRODUCTO",
  "5\t1\t1\t1\t2\t2\t575\t140\t25\t20\t80\t11",
  "5\t1\t1\t1\t2\t3\t688\t140\t50\t20\t96\t2.80",
  "5\t1\t1\t1\t2\t4\t820\t140\t50\t20\t96\t2.80",
].join("\n");
const recovered=parseReceiptTsvLayout(noisyQuantityTsv);
assert.ok(recovered);
assert.equal(recovered.items.length,1);
assert.equal(recovered.items[0].quantity,"1");
assert.equal(recovered.items[0].inferredQuantity,true);

const reconstructed=reconstructReceiptEvidence([receipt],[geometric],metadata.merchant);
assert.ok(reconstructed.layout);
assert.equal(reconstructed.layout.items.length,2);
assert.equal(reconstructed.total,7.5);
assert.equal(RECEIPT_OCR_REVISION,"canonical_integrity_v6");
assert.ok(RECEIPT_OCR_METHOD_PREFIX.includes(RECEIPT_OCR_REVISION));

console.log("ticket-ocr integrity tests OK");
