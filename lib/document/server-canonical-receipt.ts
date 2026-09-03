import { RECEIPT_OCR_METHOD_PREFIX } from "./receipt-ocr-revision";
import { receiptOcrRuntime, receiptOcrVariant } from "./receipt-ocr-provenance";
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

function withServerPreparation(result: ImageOcrResult, preparation: ServerPreparedReceiptImage): ImageOcrResult {
  if (!preparation.preprocessed) return result;
  const variant = receiptOcrVariant(preparation.paperDetected);
  const firstPass = result.passes[0] as (ImageOcrResult["passes"][number] & Record<string, unknown>) | undefined;
  const passes = firstPass ? [{
    ...firstPass,
    variant,
    paperDetected: preparation.paperDetected,
    serverPreprocessed: true,
    perspectiveCorrected: preparation.perspectiveCorrected,
    deskewAngle: preparation.deskewAngle,
    inputScaled: preparation.scaled,
    orientationFlattened: preparation.orientationFlattened,
    preprocessingSourceWidth: preparation.sourceWidth,
    preprocessingSourceHeight: preparation.sourceHeight,
    preprocessingOutputWidth: preparation.outputWidth,
    preprocessingOutputHeight: preparation.outputHeight,
  }, ...result.passes.slice(1)] : result.passes;
  const metrics = result.metrics ? {
    ...result.metrics,
    preprocessMs: Math.max(result.metrics.preprocessMs, preparation.durationMs),
    totalMs: result.metrics.totalMs + preparation.durationMs,
  } : result.metrics;
  return {
    ...result,
    method: `${RECEIPT_OCR_METHOD_PREFIX}${variant}`,
    passes,
    metrics,
    deskewAngle: preparation.deskewAngle,
    perspectiveCorrected: preparation.perspectiveCorrected,
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
      }];
    },
  };

  const result = await recognizeTicketImage(
    source,
    engine,
    () => undefined,
    options.hint ?? "receipt",
  );
  return withServerPreparation(result, preparation);
}
