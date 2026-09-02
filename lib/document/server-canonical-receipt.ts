import { receiptOcrRuntime } from "./receipt-ocr-provenance";
import { recognizeServerReceiptImage } from "./server-receipt-ocr";
import { recognizeTicketImage, type DocumentTypeHint, type ImageOcrResult } from "./ticket-ocr-engine";

export type CanonicalServerReceiptOptions = {
  mimeType?: string;
  hint?: DocumentTypeHint;
  maxBytes?: number;
  timeoutMs?: number;
  queueTimeoutMs?: number;
};

/**
 * Única entrada server-side para OCR visual de imágenes documentales.
 *
 * El reconocimiento literal siempre lo realiza Tesseract 7 en servidor y el
 * resultado pasa después por el mismo preprocesado geométrico, parser,
 * normalización y validación financiera que usa Archivo. Drive, reintentos y
 * recuperaciones dejan así de tener pipelines diferentes para la misma imagen.
 */
export async function recognizeCanonicalReceiptBytes(
  bytes: Buffer,
  options: CanonicalServerReceiptOptions = {},
): Promise<ImageOcrResult> {
  const source = new Blob([new Uint8Array(bytes)], {
    type: options.mimeType || "image/jpeg",
  }) as File;

  const engine = {
    predict: async (input: Blob | HTMLCanvasElement) => {
      const blob = input as Blob;
      if (typeof blob.arrayBuffer !== "function") {
        throw new Error("server_ocr_blob_required");
      }
      const recognized = await recognizeServerReceiptImage(
        Buffer.from(await blob.arrayBuffer()),
        {
          maxBytes: options.maxBytes,
          timeoutMs: options.timeoutMs,
          queueTimeoutMs: options.queueTimeoutMs,
        },
      );
      const runtime = receiptOcrRuntime(recognized.runtime);
      if (!runtime) throw new Error("server_ocr_runtime_mismatch");
      return [{
        image: recognized.image,
        items: recognized.items,
        metrics: recognized.metrics,
        runtime,
      }];
    },
  };

  return recognizeTicketImage(
    source,
    engine,
    () => undefined,
    options.hint ?? "receipt",
  );
}
