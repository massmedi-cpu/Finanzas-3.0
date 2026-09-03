import { receiptOcrRuntime } from "./receipt-ocr-provenance";
import { prepareServerReceiptImageBytes, type ServerPreparedReceiptImage } from "./server-receipt-image-preprocessor";
import { recognizeServerReceiptImage } from "./server-receipt-ocr";
import { recognizeTicketImage, type DocumentTypeHint, type ImageOcrResult } from "./ticket-ocr-engine";

export type CanonicalServerReceiptOptions = {
  mimeType?: string;
  hint?: DocumentTypeHint;
  maxBytes?: number;
  timeoutMs?: number;
  queueTimeoutMs?: number;
};

function originalPreparation(bytes: Buffer, mimeType: string): ServerPreparedReceiptImage {
  return {
    bytes,
    mimeType,
    sourceWidth: 0,
    sourceHeight: 0,
    outputWidth: 0,
    outputHeight: 0,
    paperDetected: false,
    perspectiveCorrected: false,
    deskewAngle: 0,
    scaled: false,
    orientationFlattened: false,
    preprocessed: false,
    durationMs: 0,
  };
}

/**
 * Única entrada server-side para OCR visual de imágenes documentales.
 *
 * Drive y cualquier otro origen servidor pasan primero por el equivalente
 * Canvas del preprocesado conservador de cámara/galería: aislamiento de papel,
 * rectificación, deskew, contraste y densidad de entrada. El reconocimiento
 * literal sigue siendo una sola inferencia Tesseract 7 y después usa exactamente
 * el mismo parser, corredor geométrico y validación financiera de Archivo.
 */
export async function recognizeCanonicalReceiptBytes(
  bytes: Buffer,
  options: CanonicalServerReceiptOptions = {},
): Promise<ImageOcrResult> {
  const mimeType = options.mimeType || "image/jpeg";
  let preparation = originalPreparation(bytes, mimeType);
  try {
    preparation = await prepareServerReceiptImageBytes(
      bytes,
      mimeType,
      options.maxBytes,
    );
  } catch {
    // Fail closed: if server canvas cannot decode/preprocess this image, retain
    // the exact original. Tesseract remains the safe canonical fallback.
    preparation = originalPreparation(bytes, mimeType);
  }

  const source = new Blob([new Uint8Array(preparation.bytes)], {
    type: preparation.mimeType,
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
        preprocessing: {
          paperDetected: preparation.paperDetected,
          perspectiveCorrected: preparation.perspectiveCorrected,
          deskewAngle: preparation.deskewAngle,
          durationMs: preparation.durationMs,
          preprocessed: preparation.preprocessed,
          scaled: preparation.scaled,
          orientationFlattened: preparation.orientationFlattened,
          sourceWidth: preparation.sourceWidth,
          sourceHeight: preparation.sourceHeight,
          outputWidth: preparation.outputWidth,
          outputHeight: preparation.outputHeight,
        },
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
