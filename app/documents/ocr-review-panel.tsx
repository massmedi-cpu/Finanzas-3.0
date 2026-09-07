"use client";

import { useEffect, useState } from "react";
import styles from "./documents.module.css";
import ocrStyles from "./ocr-review.module.css";

type StorageProvider = "supabase" | "google_drive";
type OcrStatus = "ready" | "needs_review" | "empty";

type OcrPage = {
  pageNumber: number;
  plainText: string;
  layoutText: string;
  lines: Array<{
    id: string;
    text: string;
    confidence: number;
    alignment: "left" | "center" | "right";
  }>;
};

type OcrResult = {
  contractVersion: 1;
  documentId: string;
  status: OcrStatus;
  source: "pdf_text" | "image_ocr" | "pdf_ocr" | "hybrid";
  extractor: string;
  extractedAt: string;
  confidence: number | null;
  plainText: string;
  pages: OcrPage[];
  warnings: string[];
  principles: {
    bankSource: "read_only";
    financialWrites: false;
    requiresHumanReview: true;
    preservesGeometry: true;
  };
};

const STATUS_LABELS: Record<OcrStatus, string> = {
  ready: "Lectura disponible",
  needs_review: "Revisión necesaria",
  empty: "Sin texto recuperable",
};

const WARNING_LABELS: Record<string, string> = {
  low_confidence: "La confianza global es baja: revisa el original antes de usar cualquier dato.",
  no_text_detected: "No se ha detectado texto fiable.",
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(false);
  }, [documentId]);

  const supported = mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";

  async function runOcr() {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await readJson(await fetch(`/api/documents/ocr?id=${encodeURIComponent(documentId)}`, { cache: "no-store" })) as OcrResult;
      setResult(data);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "request_failed";
      setError(errorLabel(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.subsection} ${ocrStyles.section}`} aria-labelledby="ocr-review-title" data-testid="ocr-review-panel">
      <div className={styles.subsectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>EVIDENCIA OCR · F11</p>
          <h3 id="ocr-review-title">Lectura y reconstrucción</h3>
          <p>El análisis es temporal y de solo lectura. Nunca cambia fecha, emisor, importe ni movimientos automáticamente.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void runOcr()} disabled={!supported || busy}>
          {busy ? "Analizando…" : result ? "Volver a analizar" : "Analizar con OCR"}
        </button>
      </div>

      {!supported ? <p className={styles.muted}>Este formato no admite OCR.</p> : null}
      {supported && storageProvider === "google_drive" ? <div className={ocrStyles.info}>Drive se lee mediante Financial App Reader con permiso de solo lectura sobre el archivo original. Si la carpeta Documentos aún no está compartida con esa identidad, el análisis se detendrá sin usar vistas previas ni ampliar permisos.</div> : null}
      {error ? <div className={ocrStyles.error} role="alert">{error}</div> : null}

      {result ? (
        <div className={ocrStyles.result} aria-live="polite">
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

          <div className={ocrStyles.pages}>
            {result.pages.map((page) => (
              <article className={ocrStyles.page} key={page.pageNumber}>
                <div className={ocrStyles.pageHeader}>
                  <strong>Página {page.pageNumber}</strong>
                  <span>{page.lines.length} {page.lines.length === 1 ? "línea" : "líneas"}</span>
                </div>
                {page.layoutText ? <pre className={ocrStyles.layout}>{page.layoutText}</pre> : <p className={styles.muted}>Sin texto reconstruible en esta página.</p>}
              </article>
            ))}
          </div>

          <div className={ocrStyles.principles}>
            <span>✓ Sin escrituras financieras</span>
            <span>✓ Geometría preservada</span>
            <span>✓ Revisión humana obligatoria</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
