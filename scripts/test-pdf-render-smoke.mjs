// Synthetic rasterization smoke test for PDF.js 6.x on Node.
// This certifies the scanned-page rendering prerequisite, NOT OCR text accuracy.
import assert from "node:assert/strict";

function onePageShapePdf() {
  const drawing = "q\n0 0 0 rg\n18 18 140 70 re\nf\nQ\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 180 120] /Resources << >> /Contents 4 0 R >>",
    "<< /Length " + Buffer.byteLength(drawing) + " >>\nstream\n" + drawing + "endstream",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output));
    output += String(index + 1) + " 0 obj\n" + objects[index] + "\nendobj\n";
  }
  const xrefOffset = Buffer.byteLength(output);
  output += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    output += String(offset).padStart(10, "0") + " 00000 n \n";
  }
  output += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n";
  output += "startxref\n" + xrefOffset + "\n%%EOF\n";
  return new Uint8Array(Buffer.from(output, "ascii"));
}

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const task = pdfjs.getDocument({ data: onePageShapePdf(), useSystemFonts: true });
try {
  const document = await task.promise;
  assert.equal(document.numPages, 1, "PDF generated with one rasterizable page");
  const factory = document.canvasFactory;
  assert.equal(typeof factory?.create, "function", "PDF.js Node canvas factory is available");
  const page = await document.getPage(1);
  try {
    const viewport = page.getViewport({ scale: 2 });
    const rendered = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      const taskRender = page.render({
        canvas: rendered.canvas,
        canvasContext: rendered.context,
        viewport,
        canvasFactory: factory,
      });
      await taskRender.promise;
      const png = Buffer.from(rendered.canvas.toBuffer("image/png"));
      assert.ok(png.length > 100, "PDF renders to nonempty PNG evidence");
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10],
        "rasterized page has PNG signature");
      console.log("PASS · PDF.js 6.x Node canvas rasterized a real PDF page to PNG");
    } finally {
      factory.destroy?.(rendered);
    }
  } finally {
    page.cleanup();
  }
} finally {
  await task.destroy();
}
