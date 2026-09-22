"use client";

import { useEffect, useMemo, useState } from "react";
import { summarizeDocumentOcrReview } from "../../src/application/document-ocr-review";
import type { DocumentOcrResult } from "../../src/domain/document-ocr";
import styles from "./documents.module.css";
import ocrStyles from "./ocr-review.module.css";

type StorageProvider = "supabase" | "google_drive";
type OcrStatus = DocumentOcrResult["status"];
type OcrResult = DocumentOcrResult;

const STATUS_LABELS: Record<OcrStatus, string> = {
  ready: "Lectura disponible",
  needs_review: "Revisión necesaria",
  empty: "Sin texto recuperable",
};

const WARNING_LABELS: Record<string, string> = {
  low_confidence: "La confianza global es baja: revisa el original antes de usar cualquier dato.",
  no_text_detected: "No se ha detectado texto fiable.",
  geometry_unreliable: "La posición de filas o columnas no es suficientemente fiable: compara la distribución con el original.",
  numeric_structure_unreliable: "La estructura de los importes no es suficientemente fiable: revisa cantidades y decimales contra el original.",
  peripheral_noise_detected: "Se ha detectado texto fuera del cuerpo principal del documento: comprueba que no se haya mezclado contenido del fondo.",
  orientation_corrected: "La orientación de la imagen se ha corregido automáticamente: comprueba el resultado con el original.",
  background_text_filtered: "Se ha filtrado texto del fondo para aislar el documento: revisa que no se haya descartado contenido válido.",
  incomplete_page_coverage: "No se ha podido cubrir todas las páginas del documento.",
  pdf_page_limit_reached: "El PDF supera el límite de páginas procesadas en una sola lectura.",
};

function warningLabel(warning: string) {
  if (WARNING_LABELS[warning]) return WARNING_LABELS[warning];
  if (warning.startsWith("pdf_page_requires_visual_ocr:")) {
    const page = warning.split(":")[1];
    return `La página ${page} parece escaneada y necesita OCR visual.`;
  }
  return warning.replaceAll("_", " ");
}

function confidenceLabel(value: number | null) {
  if (value === null) return "No disponible";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value * 100)} %`;
}

function sourceLabel(source: OcrResult["source"]) {
  if (source === "pdf_text") return "Texto nativo PDF";
  if (source === "pdf_ocr") return "PDF escaneado · OCR visual";
  if (source === "hybrid") return "PDF híbrido · texto + OCR";
  return "OCR de imagen";
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : typeof body?.error === "string" ? body.error : "request_failed";
    throw new Error(code);
  }
  return body;
}

function parseOcrResult(value: unknown): OcrResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ocr_response_invalid");
  const row = value as Partial<OcrResult>;
  if (row.contractVersion !== 1 || typeof row.documentId !== "string") throw new Error("ocr_response_invalid");
  if (row.status !== "ready" && row.status !== "needs_review" && row.status !== "empty") throw new Error("ocr_response_invalid");
  if (row.source !== "pdf_text" && row.source !== "image_ocr" && row.source !== "pdf_ocr" && row.source !== "hybrid") throw new Error("ocr_response_invalid");
  if (typeof row.extractor !== "string" || typeof row.extractedAt !== "string" || typeof row.plainText !== "string") throw new Error("ocr_response_invalid");
  if (row.confidence !== null && (typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1)) throw new Error("ocr_response_invalid");
  if (!Array.isArray(row.pages) || !Array.isArray(row.warnings)) throw new Error("ocr_response_invalid");
  if (!row.warnings.every((warning) => typeof warning === "string")) throw new Error("ocr_response_invalid");
  for (const page of row.pages) {
    if (!page || typeof page !== "object" || !Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || !Array.isArray(page.lines) || typeof page.plainText !== "string" || typeof page.layoutText !== "string" || (page.reviewText !== undefined && typeof page.reviewText !== "string")) {
      throw new Error("ocr_response_invalid");
    }
    for (const line of page.lines) {
      if (!line || typeof line !== "object" || typeof line.text !== "string" || typeof line.confidence !== "number" || !Number.isFinite(line.confidence) || line.confidence < 0 || line.confidence > 1) {
        throw new Error("ocr_response_invalid");
      }
    }
  }
  if (!row.principles || row.principles.bankSource !== "read_only" || row.principles.financialWrites !== false || row.principles.requiresHumanReview !== true || typeof row.principles.preservesGeometry !== "boolean") {
    throw new Error("ocr_response_invalid");
  }
  return row as OcrResult;
}

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    ocr_google_drive_file_id_missing: "Este documento de Drive no conserva un identificador de archivo válido y no puede leerse de forma segura.",
    google_drive_document_access_denied: "Financial App Reader todavía no tiene acceso de lectura al archivo original. La carpeta Documentos debe compartirse explícitamente en modo lector antes de usar OCR de Drive.",
    google_drive_document_not_found: "El archivo original ya no existe en Drive o dejó de estar visible para Financial App Reader.",
    google_drive_document_metadata_invalid: "Drive no ha devuelto metadatos íntegros del archivo original; la lectura se ha detenido.",
    google_drive_document_mime_mismatch: "El tipo real del archivo de Drive ya no coincide con el documento registrado.",
    google_drive_document_too_large: "El documento de Drive está vacío o supera el límite seguro de 15 MB para OCR.",
    google_drive_document_download_failed: "No se ha podido descargar temporalmente el archivo original desde Drive.",
    service_account_missing: "Falta la credencial gestionada de Financial App Reader en el entorno de ejecución.",
    service_account_invalid: "La credencial gestionada de Financial App Reader no coincide con la identidad autorizada.",
    service_account_scope_invalid: "El entorno ha intentado solicitar un permiso de Google no autorizado por el contrato de solo lectura.",
    service_account_token_request_failed: "Google no ha permitido iniciar la lectura gestionada de este documento.",
    service_account_token_response_invalid: "Google no ha devuelto un token de lectura válido para este documento.",
    ocr_source_download_failed: "No se ha podido descargar temporalmente el archivo privado para analizarlo.",
    ocr_source_too_large: "El documento supera el límite seguro de 15 MB para OCR.",
    ocr_image_dimensions_too_large: "La imagen tiene unas dimensiones demasiado grandes para procesarla de forma segura.",
    ocr_queue_timeout: "El motor OCR está ocupado. Puedes volver a intentarlo.",
    ocr_worker_timeout: "El motor OCR no ha podido iniciarse a tiempo.",
    ocr_recognize_timeout: "La lectura OCR ha superado el tiempo máximo de seguridad.",
    unsupported_ocr_mime_type: "Este formato todavía no admite OCR.",
    ocr_response_invalid: "La lectura terminó, pero la respuesta OCR no tiene el formato esperado. No se ha guardado ningún dato.",
  };
  return labels[code] ?? "No se ha podido completar la lectura OCR de este documento.";
}

export function OcrReviewPanel({
  documentId,
  storageProvider,
  mimeType,
}: {
  documentId: string;
  storageProvider: StorageProvider;
  mimeType: string;
}) {
  const [result, setResult] = useState<OcrResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(false);
    setOpeningOriginal(false);
    setCopyState("idle");
  }, [documentId]);

  const supported = mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
  const review = useMemo(() => result ? summarizeDocumentOcrReview(result) : null, [result]);

  async function runOcr() {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    setCopyState("idle");
    try {
      const data = await readJson(await fetch(`/api/documents/ocr?id=${encodeURIComponent(documentId)}`, { cache: "no-store" }));
      setResult(parseOcrResult(data));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "request_failed";
      setError(errorLabel(code));
    } finally {
      setBusy(false);
    }
  }

  async function openOriginal() {
    if (openingOriginal) return;
    setOpeningOriginal(true);
    setError(null);
    try {
      const opened = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(documentId)}&mode=open`, { cache: "no-store" }));
      if (typeof opened?.url !== "string") throw new Error("document_open_failed");
      window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("No se ha podido abrir el documento original.");
    } finally {
      setOpeningOriginal(false);
    }
  }

  async function copyReading() {
    if (!result?.plainText.trim()) return;
    const reviewText = result.pages
      .map((page) => page.reviewText?.trim() || page.layoutText.trim() || page.plainText.trim())
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(reviewText || result.plainText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className={`${styles.subsection} ${ocrStyles.section}`} aria-labelledby="ocr-review-title" data-testid="ocr-review-panel">
      <div className={styles.subsectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>LECTURA DEL DOCUMENTO</p>
          <h3 id="ocr-review-title">Revisar con OCR</h3>
          <p>Lee el original, reconstruye su texto y te señala qué necesita revisión. No guarda importes, fechas ni emisores por su cuenta.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void runOcr()} disabled={!supported || busy}>
          {busy ? "Analizando…" : result ? "Volver a analizar" : "Analizar documento"}
        </button>
      </div>

      <ol className={ocrStyles.flow} aria-label="Proceso de revisión OCR">
        <li className={ocrStyles.flowItem}>
          <span>1</span><div><strong>Original</strong><small>Comprueba que el archivo se ve bien.</small></div>
          <button type="button" onClick={() => void openOriginal()} disabled={openingOriginal}>{openingOriginal ? "Abriendo…" : "Abrir"}</button>
        </li>
        <li className={`${ocrStyles.flowItem} ${result ? ocrStyles.done : ""}`}>
          <span>2</span><div><strong>Lectura</strong><small>{result ? "OCR completado." : "Ejecuta OCR cuando quieras."}</small></div>
        </li>
        <li className={`${ocrStyles.flowItem} ${result ? ocrStyles.done : ""}`}>
          <span>3</span><div><strong>Revisión</strong><small>{review ? review.nextActionLabel : "Compara la lectura con el original."}</small></div>
        </li>
        <li className={ocrStyles.flowItem}>
          <span>4</span><div><strong>Datos</strong><small>Corrige y guarda sólo lo comprobado en el formulario superior.</small></div>
        </li>
      </ol>

      {!supported ? <p className={styles.muted}>Este formato no admite OCR.</p> : null}
      {supported && storageProvider === "google_drive" ? <div className={ocrStyles.info}>Drive se lee mediante Financial App Reader con permiso de solo lectura sobre el archivo original. Si la carpeta Documentos aún no está compartida con esa identidad, el análisis se detendrá sin usar vistas previas ni ampliar permisos.</div> : null}
      {error ? <div className={ocrStyles.error} role="alert">{error}</div> : null}

      {result && review ? (
        <div className={ocrStyles.result} aria-live="polite">
          <div className={`${ocrStyles.nextAction} ${ocrStyles[`next_${review.nextAction}`]}`}>
            <div><span>Siguiente paso</span><strong>{review.nextActionLabel}</strong><p>{review.nextActionDetail}</p></div>
            <div className={ocrStyles.reviewStats}>
              <span>{review.totalLines} líneas</span>
              <span>{review.lowConfidenceLines} a revisar</span>
              {review.emptyPages ? <span>{review.emptyPages} páginas vacías</span> : null}
            </div>
          </div>

          <div className={ocrStyles.metrics}>
            <div><span>Estado</span><strong>{STATUS_LABELS[result.status]}</strong></div>
            <div><span>Confianza</span><strong>{confidenceLabel(result.confidence)}</strong></div>
            <div><span>Origen</span><strong>{sourceLabel(result.source)}</strong></div>
            <div><span>Páginas</span><strong>{result.pages.length}</strong></div>
          </div>

          {result.warnings.length ? (
            <div className={ocrStyles.warnings}>
              <strong>Revisar antes de usar</strong>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warningLabel(warning)}</li>)}</ul>
            </div>
          ) : <div className={ocrStyles.success}>Lectura completada sin avisos técnicos. Aun así, comprueba el documento original antes de guardar datos.</div>}

          <div className={ocrStyles.readingActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => void copyReading()} disabled={!result.plainText.trim()}>
              {copyState === "copied" ? "Texto copiado ✓" : "Copiar texto leído"}
            </button>
            <span>Los datos editables siguen arriba y requieren guardado explícito.</span>
            {copyState === "error" ? <span role="status">No se pudo copiar. Puedes seleccionar el texto por página.</span> : null}
          </div>

          <div className={ocrStyles.pages}>
            {result.pages.map((page, index) => {
              const lowConfidence = page.lines.filter((line) => line.confidence < 0.65).length;
              return (
                <details className={ocrStyles.page} key={page.pageNumber} open={index === 0}>
                  <summary className={ocrStyles.pageHeader}>
                    <strong>Página {page.pageNumber}</strong>
                    <span>{page.lines.length} {page.lines.length === 1 ? "línea" : "líneas"}{lowConfidence ? ` · ${lowConfidence} a revisar` : ""}</span>
                  </summary>
                  {page.reviewText || page.layoutText ? <pre className={ocrStyles.layout}>{page.reviewText || page.layoutText}</pre> : <p className={styles.muted}>Sin texto reconstruible en esta página.</p>}
                </details>
              );
            })}
          </div>

          <div className={ocrStyles.principles}>
            <span>✓ Sin escrituras financieras</span>
            <span>{result.principles.preservesGeometry ? "✓ Geometría preservada" : "⚠ Geometría requiere revisión"}</span>
            <span>✓ Revisión humana obligatoria</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
