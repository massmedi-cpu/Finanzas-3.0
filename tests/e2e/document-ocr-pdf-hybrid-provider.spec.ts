import { expect, test } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";
import type { DocumentOcrProvider } from "../../src/application/document-ocr-service";

const footer = "DOCUMENTO GENERADO AUTOMATICAMENTE POR EL SISTEMA DE ARCHIVO. "
  + "SE INFORMA QUE EL TEXTO SELECCIONABLE SOLO CONTIENE UNA REFERENCIA LEGAL "
  + "Y QUE LA FACTURA ORIGINAL CON EL TOTAL SE ENCUENTRA EN LA IMAGEN ESCANEADA.";

function hybridPdf(): Uint8Array {
  const canvas = createCanvas(1000, 220);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1000, 220);
  context.fillStyle = "#000000";
  context.font = "bold 62px Arial";
  context.fillText("TOTAL 23,45", 45, 145);
  const jpeg = canvas.toBuffer("image/jpeg");

  // 3 Tr: selectable, invisible PDF text. Visible financial content stays in
  // the JPEG XObject. This test never loads real invoices or credentials.
  const commands = Buffer.from(
    "q\n1000 0 0 220 0 0 cm\n/Im1 Do\nQ\n"
      + "BT\n/F1 8 Tf\n3 Tr\n15 20 Td\n(" + footer + ") Tj\nET\n", "ascii",
  );
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 220]"
      + " /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >>"
      + " /Contents 4 0 R >>"),
    Buffer.concat([Buffer.from("<< /Length " + commands.length + " >>\nstream\n"),commands,Buffer.from("\nendstream")]),
    Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width 1000"
      + " /Height 220 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter"
      + " /DCTDecode /Length " + jpeg.length + " >>\nstream\n"),jpeg,Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  const parts=[Buffer.from("%PDF-1.4\n")];
  const offsets=[0];
  let position=parts[0].byteLength;
  objects.forEach((object,index)=>{
    const part=Buffer.concat([Buffer.from(index+1+" 0 obj\n"),object,Buffer.from("\nendobj\n")]);
    offsets.push(position);
    parts.push(part);
    position+=part.byteLength;
  });
  const xref="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n"
    + offsets.slice(1).map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("")
    + "trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"
    +position+"\n%%EOF\n";
  parts.push(Buffer.from(xref));
  return new Uint8Array(Buffer.concat(parts));
}

function visualResult(confidence: number): Awaited<ReturnType<DocumentOcrProvider["extract"]>> {
  return {
    source: "tesseract",
    extractor: "synthetic-confident-or-uncertain-result",
    pages: [{ pageNumber: 1, words: ["TOTAL", "23,45"].map((text,index)=>({
      text, confidence, box: { x: 0.1 + index*0.2, y: 0.45, width: 0.18, height: 0.15 },
    })) }],
    warnings: [],
  };
}

test("REC-OCR-065 · actual PDF.js page selects clear scanned total over invisible selectable boilerplate", async () => {
  let rasterReads=0;
  const provider=new PdfTextOcrProvider({
    extract: async ({ bytes, mimeType }) => {
      rasterReads+=1;
      expect(mimeType).toBe("image/png");
      expect([...bytes.slice(0, 8)]).toEqual([137,80,78,71,13,10,26,10]);
      return visualResult(0.92);
    },
  });
  const result=await provider.extract({
    bytes:hybridPdf(),mimeType:"application/pdf",originalFileName:"escaneo-sintetico.pdf",
  });
  expect(rasterReads).toBe(1);
  expect(result.source).toBe("pdf_ocr");
  expect(result.pages[0].words.map(word=>word.text)).toEqual(["TOTAL","23,45"]);
  expect(result.warnings).toContain("pdf_page_sparse_native_recovered:1");
});

test("REC-OCR-066 · actual PDF.js retains selectable original when raster recognition is uncertain", async () => {
  let rasterReads=0;
  const provider=new PdfTextOcrProvider({
    extract:async () => { rasterReads+=1; return visualResult(0.18); },
  });
  const result=await provider.extract({
    bytes:hybridPdf(),mimeType:"application/pdf",originalFileName:"escaneo-sintetico.pdf",
  });
  expect(rasterReads).toBe(1);
  expect(result.source).toBe("pdf_text");
  expect(result.pages[0].words.map(word=>word.text).join(" ")).toContain("DOCUMENTO GENERADO");
  expect(result.warnings).toContain("pdf_page_sparse_native_unverified:1");
});
