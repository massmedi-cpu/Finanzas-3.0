import { expect, test } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";
import type { DocumentOcrProvider } from "../../src/application/document-ocr-service";

const footer = "DOCUMENTO GENERADO AUTOMATICAMENTE POR EL SISTEMA DE ARCHIVO. "
  + "SE INFORMA QUE EL TEXTO SELECCIONABLE SOLO CONTIENE UNA REFERENCIA LEGAL "
  + "Y QUE LA FACTURA ORIGINAL CON EL TOTAL SE ENCUENTRA EN LA IMAGEN ESCANEADA.";

function hybridPdf(selectableText = footer): Uint8Array {
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
      + "BT\n/F1 8 Tf\n3 Tr\n15 20 Td\n(" + selectableText + ") Tj\nET\n", "ascii",
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
    source: "image_ocr",
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


test("REC-OCR-081 · actual PDF.js recovers raster total beneath an invisible footer longer than 260 chars", async () => {
  const longFooter = footer.repeat(3);
  expect(longFooter.length).toBeGreaterThan(260);
  let visualReads = 0;
  const provider = new PdfTextOcrProvider({
    extract: async ({ bytes, mimeType }) => {
      visualReads += 1;
      expect(mimeType).toBe("image/png");
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      return visualResult(0.96);
    },
  });
  const result = await provider.extract({
    bytes: hybridPdf(longFooter),
    mimeType: "application/pdf",
    originalFileName: "raster-bajo-overlay-largo.pdf",
  });
  expect(visualReads).toBe(1);
  expect(result.source).toBe("pdf_ocr");
  expect(result.pages[0].words.map((word) => word.text)).toEqual(["TOTAL", "23,45"]);
  expect(result.warnings).toContain("pdf_page_sparse_native_recovered:1");
});

test("REC-OCR-082 · actual PDF.js preserves the fast path when native overlay has a genuine total", async () => {
  const nativeText = "FACTURA ORIGINAL. TOTAL 23,45 EUR. " + footer.repeat(3);
  expect(nativeText.length).toBeGreaterThan(260);
  let visualReads = 0;
  const provider = new PdfTextOcrProvider({
    extract: async () => {
      visualReads += 1;
      return visualResult(0.96);
    },
  });
  const result = await provider.extract({
    bytes: hybridPdf(nativeText),
    mimeType: "application/pdf",
    originalFileName: "factura-texto-nativo-valido.pdf",
  });
  expect(visualReads).toBe(0);
  expect(result.source).toBe("pdf_text");
  expect(result.pages[0].words.map((word) => word.text).join(" ")).toContain("TOTAL 23,45 EUR");
  expect(result.warnings).not.toContain("pdf_page_sparse_native_unverified:1");
});

test("REC-OCR-083 · actual PDF.js must not borrow VAT amount after an empty TOTAL label", async () => {
  const incompleteTotal = "FACTURA ORIGINAL. TOTAL pendiente. IVA 12,50 EUR. " + footer.repeat(2);
  let visualReads = 0;
  const provider = new PdfTextOcrProvider({
    extract: async () => {
      visualReads += 1;
      return visualResult(0.96);
    },
  });
  const result = await provider.extract({
    bytes: hybridPdf(incompleteTotal),
    mimeType: "application/pdf",
    originalFileName: "total-ilegible-iva-legible.pdf",
  });
  expect(visualReads).toBe(1);
  expect(result.source).toBe("pdf_ocr");
  expect(result.pages[0].words.map((word) => word.text)).toEqual(["TOTAL", "23,45"]);
});


test("REC-OCR-087 · actual PDF.js preserves short native total against longer conflicting raster OCR", async () => {
  const nativeText = "FACTURA ORIGINAL TOTAL 45,30 EUR";
  let visualReads = 0;
  const provider = new PdfTextOcrProvider({
    extract: async () => {
      visualReads += 1;
      return {
        ...visualResult(0.96),
        pages: [{
          pageNumber: 1,
          words: [
            { text: "TOTAL", confidence: 0.96, box: { x: 0.1, y: 0.4, width: 0.12, height: 0.12 } },
            { text: "23,45", confidence: 0.96, box: { x: 0.22, y: 0.4, width: 0.12, height: 0.12 } },
            ...Array.from({ length: 25 }, (_, index) => ({
              text: "CONCEPTO", confidence: 0.96,
              box: { x: 0.1, y: 0.55 + index * 0.01, width: 0.2, height: 0.009 },
            })),
          ],
        }],
      };
    },
  });
  const result = await provider.extract({
    bytes: hybridPdf(nativeText), mimeType: "application/pdf",
    originalFileName: "factura-conflicto-nativo-visual.pdf",
  });
  // The native layer is short enough to warrant a bounded visual attempt,
  // yet OCR volume alone is never grounds to change a known invoice total.
  expect(visualReads).toBe(1);
  expect(result.source).toBe("pdf_text");
  const selected = result.pages[0].words.map((word) => word.text).join(" ");
  expect(selected).toContain("TOTAL 45,30 EUR");
  expect(selected).not.toContain("23,45");
  expect(result.warnings).toContain("pdf_page_sparse_native_unverified:1");
});


test("REC-OCR-097 · real PDF.js preserves an original whole-euro TOTAL in EUR over conflicting raster OCR", async () => {
  const nativeText = "FACTURA ORIGINAL TOTAL 45 EUR";
  let visualReads = 0;
  const provider = new PdfTextOcrProvider({
    extract: async ({ bytes, mimeType }) => {
      visualReads += 1;
      expect(mimeType).toBe("image/png");
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      return {
        ...visualResult(0.96),
        pages: [{
          pageNumber: 1,
          words: [
            { text: "TOTAL", confidence: 0.96, box: { x: 0.1, y: 0.3, width: 0.1, height: 0.08 } },
            { text: "23,45", confidence: 0.96, box: { x: 0.2, y: 0.3, width: 0.1, height: 0.08 } },
            ...Array.from({ length: 30 }, (_, index) => ({
              text: "PRODUCTO", confidence: 0.96,
              box: { x: 0.1, y: 0.42 + index * 0.01, width: 0.2, height: 0.008 },
            })),
          ],
        }],
      };
    },
  });
  const result = await provider.extract({
    bytes: hybridPdf(nativeText),
    mimeType: "application/pdf",
    originalFileName: "original-euros-enteros-con-capa-raster.pdf",
  });
  expect(visualReads).toBe(1);
  expect(result.source).toBe("pdf_text");
  const selected = result.pages[0].words.map((word) => word.text).join(" ");
  expect(selected).toContain("TOTAL 45 EUR");
  expect(selected).not.toContain("23,45");
  expect(result.warnings).toContain("pdf_page_sparse_native_unverified:1");
});
