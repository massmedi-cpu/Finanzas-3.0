"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumberWithDigits } from "../../src/core/formatters";
import { summarizeDocumentOcrReview, type DocumentOcrReviewField } from "../../src/application/document-ocr-review";
import { interpretDocumentOcrFinancially, type DocumentOcrFinancialInterpretation } from "../../src/domain/document-ocr-financial-interpretation";
import { useActionFeedback } from "../action-feedback";
import type { DocumentOcrResult } from "../../src/domain/document-ocr";
import styles from "./documents.module.css";
import ocrStyles from "./ocr-review.module.css";
import { OcrPageReviewWorkbench } from "./ocr-page-review-workbench";

type StorageProvider = "supabase" | "google_drive";
type OcrStatus = DocumentOcrResult["status"];
type OcrResult = DocumentOcrResult;

type ReviewLineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
};

type ReviewDraft = {
  type: "ticket" | "invoice" | "other";
  documentDate: string;
  documentTime: string;
  issuerName: string;
  issuerTaxId: string;
  documentNumber: string;
  billingPeriod: string;
  taxBase: string;
  taxes: string;
  total: string;
  paymentMethod: string;
  notes: string;
  lineItems: ReviewLineDraft[];
};

type DocumentDetailForReview = {
  type?: "ticket" | "invoice" | "other";
  documentDate?: string | null;
  documentTime?: string | null;
  issuerName?: string | null;
  issuerTaxId?: string | null;
  documentNumber?: string | null;
  billingPeriod?: string | null;
  taxBaseCents?: number | null;
  taxesCents?: number | null;
  totalCents?: number | null;
  paymentMethod?: string | null;
  lineItems?: Array<{ description?: string; quantity?: number | null; unitPriceCents?: number | null; totalCents?: number | null }>;
  notes?: string;
};

type OcrHistory = {
  runs?: Array<{ id?: string; extractor?: string; extractedAt?: string }>;
  reviews?: Array<{ revision?: number; ocrRunId?: string | null }>;
};

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
  receipt_arithmetic_mismatch: "Los importes leídos no cuadran entre sí: revisa cantidades, precios, IVA y total contra el original.",
  receipt_structure_incomplete: "Hay filas de producto que no se han podido estructurar por completo: la lectura queda pendiente de revisión.",
  incomplete_page_coverage: "No se ha podido cubrir todas las páginas del documento.",
  pdf_page_limit_reached: "El PDF supera el límite de páginas procesadas en una sola lectura.",
  base_plus_tax_mismatch: "La base imponible y los impuestos detectados no cuadran con el total. No confirmes los importes sin revisar el original.",
  ocr_empty: "El OCR no ha recuperado texto utilizable.",
  ocr_needs_review: "El OCR ha marcado esta lectura como pendiente de revisión.",
};

function warningLabel(warning: string) {
  if (WARNING_LABELS[warning]) return WARNING_LABELS[warning];
  if (warning.startsWith("pdf_page_requires_visual_ocr:")) {
    const page = warning.split(":")[1];
    return `La página ${page} parece escaneada y necesita OCR visual.`;
  }
  if (warning.startsWith("pdf_page_sparse_native_recovered:")) {
    const page = warning.split(":")[1];
    return `La página ${page} contenía muy poco texto digital; se recuperó más información mediante OCR visual. Contrasta el resultado con el original.`;
  }
  if (warning.startsWith("pdf_page_sparse_native_unverified:")) {
    const page = warning.split(":")[1];
    return `La página ${page} solo tenía texto digital parcial y la lectura visual no lo completó. No se debe dar por íntegra la factura sin revisar el original.`;
  }
  return warning.replaceAll("_", " ");
}

function confidenceLabel(value: number | null) {
  if (value === null) return "No disponible";
  return `${formatNumberWithDigits(value * 100, 0)} %`;
}

function financialFieldValue(field: DocumentOcrReviewField) {
  if (field.value === null) return "No detectado";
  if (field.key === "taxBaseCents" || field.key === "taxesCents" || field.key === "totalCents") {
    return `${formatNumberWithDigits(Number(field.value) / 100, 2)} €`;
  }
  if (field.key === "date" && typeof field.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
    const [year, month, day] = field.value.split("-");
    return `${day}/${month}/${year}`;
  }
  return String(field.value);
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
    if (page.receiptIntegrity !== undefined) {
      const integrity = page.receiptIntegrity;
      if (!integrity || typeof integrity !== "object"
        || (integrity.status !== "verified" && integrity.status !== "issues" && integrity.status !== "partial")
        || !Number.isSafeInteger(integrity.productRows) || integrity.productRows < 0
        || !Number.isSafeInteger(integrity.candidateProductRows) || integrity.candidateProductRows < integrity.productRows
        || !Number.isSafeInteger(integrity.unresolvedProductRows) || integrity.unresolvedProductRows < 0
        || integrity.unresolvedProductRows !== integrity.candidateProductRows - integrity.productRows
        || !Number.isSafeInteger(integrity.arithmeticRowsChecked) || integrity.arithmeticRowsChecked < 0
        || !Number.isSafeInteger(integrity.arithmeticRowsMatching) || integrity.arithmeticRowsMatching < 0
        || integrity.arithmeticRowsMatching > integrity.arithmeticRowsChecked
        || (integrity.lineTotalMatchesDocumentTotal !== null && typeof integrity.lineTotalMatchesDocumentTotal !== "boolean")
        || (integrity.basePlusTaxMatchesTotal !== null && typeof integrity.basePlusTaxMatchesTotal !== "boolean")) {
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

function integrityLabel(integrity: NonNullable<OcrResult["pages"][number]["receiptIntegrity"]>) {
  const coverage = `${integrity.productRows}/${integrity.candidateProductRows} filas estructuradas`;
  const rows = `${integrity.arithmeticRowsMatching}/${integrity.arithmeticRowsChecked} líneas cuadran`;
  const total = integrity.lineTotalMatchesDocumentTotal === null
    ? "total no comprobable"
    : integrity.lineTotalMatchesDocumentTotal
      ? "suma de líneas = total"
      : "suma de líneas ≠ total";
  const tax = integrity.basePlusTaxMatchesTotal === null
    ? null
    : integrity.basePlusTaxMatchesTotal
      ? "base + IVA = total"
      : "base + IVA ≠ total";
  return [coverage, rows, total, tax].filter(Boolean).join(" · ");
}

function moneyInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

function moneyCents(value: string, field: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`invalid_${field}`);
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`invalid_${field}`);
  return cents;
}

function quantityValue(value: string, field: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const quantity = Number(normalized);
  if (!Number.isFinite(quantity) || Math.abs(quantity) > 1_000_000) throw new Error(`invalid_${field}`);
  return quantity;
}

function reviewDraft(
  interpretation: DocumentOcrFinancialInterpretation,
  detail?: DocumentDetailForReview | null,
): ReviewDraft {
  const existingLines = Array.isArray(detail?.lineItems) ? detail!.lineItems! : [];
  const interpretedLines = interpretation.lines.length ? interpretation.lines : existingLines;
  return {
    type: detail?.type ?? "other",
    documentDate: interpretation.date.value ?? detail?.documentDate ?? "",
    documentTime: interpretation.time.value ?? detail?.documentTime ?? "",
    issuerName: interpretation.issuer.value ?? detail?.issuerName ?? "",
    issuerTaxId: interpretation.taxId.value ?? detail?.issuerTaxId ?? "",
    documentNumber: interpretation.documentNumber.value ?? detail?.documentNumber ?? "",
    billingPeriod: interpretation.period.value ?? detail?.billingPeriod ?? "",
    taxBase: moneyInput(interpretation.taxBaseCents.value ?? detail?.taxBaseCents),
    taxes: moneyInput(interpretation.taxesCents.value ?? detail?.taxesCents),
    total: moneyInput(interpretation.totalCents.value ?? detail?.totalCents),
    paymentMethod: interpretation.paymentMethod.value ?? detail?.paymentMethod ?? "",
    notes: detail?.notes ?? "",
    lineItems: interpretedLines.map((line) => ({
      description: line.description ?? "",
      quantity: line.quantity === null || line.quantity === undefined ? "" : String(line.quantity),
      unitPrice: moneyInput(line.unitPriceCents),
      total: moneyInput(line.totalCents),
    })),
  };
}

function sameInstant(left: string | undefined, right: string) {
  if (!left) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function OcrReviewPanel({
  documentId,
  storageProvider,
  mimeType,
  onConfirmed,
}: {
  documentId: string;
  storageProvider: StorageProvider;
  mimeType: string;
  onConfirmed?: () => Promise<void> | void;
}) {
  const actionFeedback = useActionFeedback();
  const [result, setResult] = useState<OcrResult | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [ocrRunId, setOcrRunId] = useState<string | null>(null);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationUnverified, setConfirmationUnverified] = useState(false);
  const [checkingConfirmation, setCheckingConfirmation] = useState(false);
  const knownReviewRevision = useRef(0);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const activeDocumentId = useRef(documentId);
  const documentGeneration = useRef(0);
  const ocrRequest = useRef<AbortController | null>(null);
  const ocrInFlight = useRef(false);
  const confirmInFlight = useRef(false);

  useEffect(() => {
    activeDocumentId.current = documentId;
    documentGeneration.current += 1;
    ocrRequest.current?.abort();
    ocrRequest.current = null;
    ocrInFlight.current = false;
    confirmInFlight.current = false;
    setResult(null);
    setDraft(null);
    setOcrRunId(null);
    setConfirmedRevision(null);
    setConfirmationUnverified(false);
    setCheckingConfirmation(false);
    knownReviewRevision.current = 0;
    setError(null);
    setBusy(false);
    setConfirming(false);
    setOpeningOriginal(false);
    setCopyState("idle");
    return () => {
      documentGeneration.current += 1;
      ocrRequest.current?.abort();
      ocrInFlight.current = false;
      confirmInFlight.current = false;
    };
  }, [documentId]);

  const editsLocked = busy || confirming || confirmationUnverified;

  const supported = mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
  const review = useMemo(() => result ? summarizeDocumentOcrReview(result) : null, [result]);

  async function hydrateConfirmation(
    parsed: OcrResult,
    interpretation: DocumentOcrFinancialInterpretation,
    generation: number,
    signal: AbortSignal,
  ) {
    try {
      const [detailResponse, historyResponse] = await Promise.all([
        readJson(await fetch(`/api/documents?id=${encodeURIComponent(documentId)}`, { cache: "no-store", signal })),
        readJson(await fetch(`/api/documents/ocr-review?id=${encodeURIComponent(documentId)}`, { cache: "no-store", signal })),
      ]);
      if (signal.aborted || generation !== documentGeneration.current || activeDocumentId.current !== documentId) return;
      const detail = detailResponse?.document && typeof detailResponse.document === "object"
        ? detailResponse.document as DocumentDetailForReview
        : null;
      const history = historyResponse as OcrHistory;
      const run = history.runs?.find((candidate) => candidate.extractor === parsed.extractor && sameInstant(candidate.extractedAt, parsed.extractedAt));
      setDraft(reviewDraft(interpretation, detail));
      setOcrRunId(typeof run?.id === "string" ? run.id : null);
      knownReviewRevision.current = (history.reviews ?? [])
        .filter((review) => review.ocrRunId === run?.id
          && typeof review.revision === "number" && Number.isSafeInteger(review.revision))
        .reduce((max, review) => Math.max(max, review.revision ?? 0), 0);
      setConfirmedRevision(null);
      if (!run?.id) {
        setError("La lectura se ha completado, pero no se ha podido enlazar con su evidencia persistida. Puedes revisar los datos, pero no confirmarlos todavía.");
      }
    } catch {
      if (!signal.aborted && generation === documentGeneration.current && activeDocumentId.current === documentId) {
        setError("La lectura se ha completado, pero no se ha podido preparar la confirmación persistente. El OCR bruto sigue visible para revisión.");
      }
    }
  }

  async function runOcr() {
    if (!supported || busy || confirming || confirmationUnverified || ocrInFlight.current || activeDocumentId.current !== documentId) return;
    const generation = documentGeneration.current;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted
      && generation === documentGeneration.current
      && activeDocumentId.current === documentId;
    ocrInFlight.current = true;
    ocrRequest.current = controller;
    setBusy(true);
    setError(null);
    setCopyState("idle");
    setOcrRunId(null);
    setConfirmedRevision(null);
    knownReviewRevision.current = 0;
    const feedbackId = `documents:ocr:${documentId}`;
    actionFeedback.begin(feedbackId, "Analizando documento con OCR…");
    try {
      const data = await readJson(await fetch(`/api/documents/ocr?id=${encodeURIComponent(documentId)}`, { method: "POST", cache: "no-store", signal: controller.signal }));
      if (!isCurrent()) return;
      const parsed = parseOcrResult(data);
      if (parsed.documentId !== documentId) throw new Error("ocr_response_invalid");
      const interpretation = interpretDocumentOcrFinancially(parsed);
      setResult(parsed);
      setDraft(reviewDraft(interpretation));
      actionFeedback.success(feedbackId, "Lectura OCR completada. Revisa el resultado antes de confirmar sus datos.");
      await hydrateConfirmation(parsed, interpretation, generation, controller.signal);
    } catch (caught) {
      if (!isCurrent()) return;
      const code = caught instanceof Error ? caught.message : "request_failed";
      const message = errorLabel(code);
      setError(message);
      actionFeedback.error(feedbackId, message);
    } finally {
      if (isCurrent()) {
        ocrInFlight.current = false;
        if (ocrRequest.current === controller) ocrRequest.current = null;
        setBusy(false);
      }
    }
  }

  async function confirmReview() {
    if (!draft || !ocrRunId || confirming || confirmedRevision !== null || confirmationUnverified || confirmInFlight.current || busy || activeDocumentId.current !== documentId) return;
    confirmInFlight.current = true;
    const generation = documentGeneration.current;
    const isCurrent = () => generation === documentGeneration.current
      && activeDocumentId.current === documentId;
    setConfirming(true);
    setError(null);
    const feedbackId = `documents:ocr-confirm:${documentId}`;
    actionFeedback.begin(feedbackId, "Guardando revisión confirmada…");
    try {
      const payload = {
        documentId,
        ocrRunId,
        type: draft.type,
        documentDate: draft.documentDate || null,
        documentTime: draft.documentTime || null,
        issuerName: draft.issuerName || null,
        issuerTaxId: draft.issuerTaxId || null,
        documentNumber: draft.documentNumber || null,
        billingPeriod: draft.billingPeriod || null,
        taxBaseCents: moneyCents(draft.taxBase, "document_tax_base"),
        taxesCents: moneyCents(draft.taxes, "document_taxes"),
        totalCents: moneyCents(draft.total, "document_total"),
        paymentMethod: draft.paymentMethod || null,
        lineItems: draft.lineItems
          .filter((line) => line.description.trim())
          .map((line, index) => ({
            description: line.description.trim(),
            quantity: quantityValue(line.quantity, `document_line_${index}_quantity`),
            unitPriceCents: moneyCents(line.unitPrice, `document_line_${index}_unit_price`),
            totalCents: moneyCents(line.total, `document_line_${index}_total`),
          })),
        notes: draft.notes,
      };
      const saved = await readJson(await fetch("/api/documents/ocr-review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      // Do not abort an already submitted confirmation (the server may have
      // committed it); only suppress feedback for an unrelated new document.
      if (!isCurrent()) return;
      const revision = typeof saved?.revision === "number" && Number.isSafeInteger(saved.revision) && saved.revision > 0
        ? saved.revision : null;
      const confirmedValues = saved?.reviewedValues;
      // Verified against the live, read-only PostgreSQL function contract:
      // revision alone cannot identify the document or the OCR run, nor
      // prove that the financial amounts sent by the human were persisted.
      if (
        revision === null
        || revision <= knownReviewRevision.current
        || saved?.contractVersion !== 2
        || saved?.documentId !== documentId
        || saved?.ocrRunId !== ocrRunId
        || saved?.rawEvidenceImmutable !== true
        || saved?.bankSource !== "read_only"
        || saved?.financialWrites !== false
        || saved?.requiresHumanReview !== true
        || !confirmedValues || typeof confirmedValues !== "object" || Array.isArray(confirmedValues)
        || confirmedValues.type !== payload.type
        || confirmedValues.documentDate !== payload.documentDate
        || confirmedValues.taxBaseCents !== payload.taxBaseCents
        || confirmedValues.taxesCents !== payload.taxesCents
        || confirmedValues.totalCents !== payload.totalCents
      ) {
        throw new Error("ocr_confirmation_unverified");
      }
      knownReviewRevision.current = Math.max(knownReviewRevision.current, revision);
      setConfirmationUnverified(false);
      setConfirmedRevision(revision);
      actionFeedback.success(feedbackId, `Revisión OCR confirmada · revisión ${revision}.`);
      // Refreshing the parent list is not part of the PATCH transaction.
      // A failed post-save refresh must never claim that persistence failed.
      if (onConfirmed) {
        try {
          await onConfirmed();
        } catch {
          if (isCurrent()) {
            setError("La revisión se ha guardado, pero no se pudo actualizar el listado. Puedes recargar Documentos; no confirmes de nuevo.");
          }
        }
      }
    } catch (caught) {
      if (!isCurrent()) return;
      const code = caught instanceof Error ? caught.message : "request_failed";
      const message = code.startsWith("invalid_")
        ? "Hay un dato de la revisión con formato no válido. Corrígelo antes de confirmar."
        : "No se pudo comprobar si la revisión OCR llegó a guardarse. Consulta su historial antes de volver a confirmar para evitar duplicados.";
      setError(message);
      if (!code.startsWith("invalid_")) setConfirmationUnverified(true);
      actionFeedback.error(feedbackId, message);
    } finally {
      if (isCurrent()) {
        confirmInFlight.current = false;
        setConfirming(false);
      }
    }
  }

  async function checkReviewConfirmation() {
    if (!confirmationUnverified || !ocrRunId || checkingConfirmation || confirmInFlight.current) return;
    const generation = documentGeneration.current;
    const currentRunId = ocrRunId;
    setCheckingConfirmation(true);
    setError(null);
    try {
      const history = await readJson(await fetch(
        `/api/documents/ocr-review?id=${encodeURIComponent(documentId)}`,
        { cache: "no-store" },
      )) as OcrHistory;
      if (generation !== documentGeneration.current || activeDocumentId.current !== documentId) return;
      const confirmed = (history.reviews ?? [])
        .filter((review) => review.ocrRunId === currentRunId
          && typeof review.revision === "number" && Number.isSafeInteger(review.revision))
        .reduce((max, review) => Math.max(max, review.revision ?? 0), 0);
      if (confirmed > knownReviewRevision.current) {
        knownReviewRevision.current = confirmed;
        setConfirmedRevision(confirmed);
        setConfirmationUnverified(false);
        setError(null);
        actionFeedback.success(`documents:ocr-confirm:${documentId}`, `Revisión OCR verificada en el historial · revisión ${confirmed}.`);
        if (onConfirmed) {
          try {
            await onConfirmed();
          } catch {
            if (generation === documentGeneration.current && activeDocumentId.current === documentId) {
              setError("La revisión se ha verificado, pero el listado no pudo actualizarse. Puedes recargar Documentos sin guardar otra vez.");
            }
          }
        }
      } else {
        setError("El historial no muestra una revisión nueva para esta lectura. La confirmación anterior sigue sin verificarse; solo repítela si has comprobado que es necesario.");
      }
    } catch {
      if (generation === documentGeneration.current && activeDocumentId.current === documentId) {
        setError("No se ha podido consultar el historial de revisiones. No se ha repetido ninguna confirmación.");
      }
    } finally {
      if (generation === documentGeneration.current && activeDocumentId.current === documentId) {
        setCheckingConfirmation(false);
      }
    }
  }

  function updateDraft<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    if (editsLocked || confirmInFlight.current || ocrInFlight.current) return;
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setConfirmedRevision(null);
  }

  function updateLine(index: number, key: keyof ReviewLineDraft, value: string) {
    if (editsLocked || confirmInFlight.current || ocrInFlight.current) return;
    setDraft((current) => {
      if (!current) return current;
      const lineItems = current.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line);
      return { ...current, lineItems };
    });
    setConfirmedRevision(null);
  }

  function addLine() {
    if (editsLocked || confirmInFlight.current || ocrInFlight.current) return;
    setDraft((current) => current ? {
      ...current,
      lineItems: [...current.lineItems, { description: "", quantity: "", unitPrice: "", total: "" }],
    } : current);
    setConfirmedRevision(null);
  }

  function removeLine(index: number) {
    if (editsLocked || confirmInFlight.current || ocrInFlight.current) return;
    setDraft((current) => current ? { ...current, lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index) } : current);
    setConfirmedRevision(null);
  }

  async function openOriginal() {
    if (openingOriginal || activeDocumentId.current !== documentId) return;
    const generation = documentGeneration.current;
    const isCurrent = () => generation === documentGeneration.current
      && activeDocumentId.current === documentId;
    setOpeningOriginal(true);
    setError(null);
    try {
      const opened = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(documentId)}&mode=open`, { cache: "no-store" }));
      if (!isCurrent()) return;
      if (typeof opened?.url !== "string") throw new Error("document_open_failed");
      window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch {
      if (isCurrent()) setError("No se ha podido abrir el documento original.");
    } finally {
      if (isCurrent()) setOpeningOriginal(false);
    }
  }

  async function copyReading() {
    if (!result?.plainText.trim() || activeDocumentId.current !== documentId) return;
    const generation = documentGeneration.current;
    const isCurrent = () => generation === documentGeneration.current
      && activeDocumentId.current === documentId;
    const reviewText = result.pages
      .map((page) => page.reviewText?.trim() || page.layoutText.trim() || page.plainText.trim())
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(reviewText || result.plainText);
      if (isCurrent()) setCopyState("copied");
    } catch {
      if (isCurrent()) setCopyState("error");
    }
  }

  return (
    <section className={`${styles.subsection} ${ocrStyles.section}`} aria-labelledby="ocr-review-title" data-testid="ocr-review-panel">
      <div className={styles.subsectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>LECTURA DEL DOCUMENTO</p>
          <h3 id="ocr-review-title">Revisar con OCR</h3>
          <p>Lee el original, reconstruye su texto e interpreta los datos financieros sin sustituir la evidencia OCR. Nada se confirma sin revisión humana.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void runOcr()} disabled={!supported || busy || confirming || confirmationUnverified}>
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
          <span>3</span><div><strong>Revisión</strong><small>{review ? review.nextActionLabel : "Compara la lectura y los campos con el original."}</small></div>
        </li>
        <li className={`${ocrStyles.flowItem} ${confirmedRevision ? ocrStyles.done : ""}`}>
          <span>4</span><div><strong>Confirmación</strong><small>{confirmedRevision ? `Guardada como revisión ${confirmedRevision}.` : "Los datos interpretados siguen siendo derivados hasta que los confirmes."}</small></div>
        </li>
      </ol>

      {!supported ? <p className={styles.muted}>Este formato no admite OCR.</p> : null}
      {supported && storageProvider === "google_drive" ? <div className={ocrStyles.info}>Drive se lee mediante Financial App Reader con permiso de solo lectura sobre el archivo original. Si la carpeta Documentos aún no está compartida con esa identidad, el análisis se detendrá sin usar vistas previas ni ampliar permisos.</div> : null}
      {error ? <div className={ocrStyles.error} role="alert">{error}</div> : null}
      {confirmationUnverified ? (
        <div className={ocrStyles.info} role="status" data-ocr-confirmation="unverified">
          <p>La última confirmación podría haberse guardado. Antes de repetirla, comprueba su historial.</p>
          <button className={styles.secondaryButton} type="button" onClick={() => void checkReviewConfirmation()} disabled={checkingConfirmation || confirming}>
            {checkingConfirmation ? "Comprobando…" : "Comprobar revisión sin volver a guardar"}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => {
            setConfirmationUnverified(false);
            setError("Has desbloqueado la edición después de comprobar el historial. No se puede afirmar que la revisión anterior haya sido revertida.");
          }} disabled={checkingConfirmation || confirming}>
            He comprobado el historial; permitir nuevo intento
          </button>
        </div>
      ) : null}

      {result && review ? (
        <div className={ocrStyles.result} aria-live="polite">
          <div className={`${ocrStyles.nextAction} ${ocrStyles[`next_${review.nextAction}`]}`}>
            <div><span>Siguiente paso</span><strong>{review.nextActionLabel}</strong><p>{review.nextActionDetail}</p></div>
            <div className={ocrStyles.reviewStats}>
              <span>{review.totalLines} líneas</span>
              <span>{review.detectedFinancialFields} campos detectados</span>
              <span>{review.doubtfulFinancialFields} dudosos</span>
              {review.emptyPages ? <span>{review.emptyPages} páginas vacías</span> : null}
            </div>
          </div>

          <div className={ocrStyles.metrics}>
            <div><span>Estado</span><strong>{STATUS_LABELS[result.status]}</strong></div>
            <div><span>Confianza</span><strong>{confidenceLabel(result.confidence)}</strong></div>
            <div><span>Origen</span><strong>{sourceLabel(result.source)}</strong></div>
            <div><span>Páginas</span><strong>{result.pages.length}</strong></div>
          </div>

          {draft ? (
            <div className={styles.editor} data-testid="ocr-confirmation-form">
              <div className={styles.subsectionHeading}>
                <div>
                  <p className={styles.sectionEyebrow}>REVISIÓN HUMANA</p>
                  <h3>Corregir y confirmar datos</h3>
                  <p>La propuesta parte del OCR, pero estos campos son editables y no sustituyen al original hasta que los confirmes.</p>
                </div>
                <button className={styles.primaryButton} type="button" onClick={() => void confirmReview()} disabled={!ocrRunId || confirming || confirmedRevision !== null || confirmationUnverified || result.status === "empty"}>
                  {confirming ? "Confirmando…" : confirmedRevision ? "Confirmado ✓" : "Confirmar revisión"}
                </button>
              </div>

              <div className={styles.formGrid}>
                <label>Tipo<select disabled={editsLocked} value={draft.type} onChange={(event) => updateDraft("type", event.target.value as ReviewDraft["type"])}><option value="ticket">Ticket</option><option value="invoice">Factura</option><option value="other">Otro</option></select></label>
                <label>Fecha<input disabled={editsLocked} type="date" value={draft.documentDate} onChange={(event) => updateDraft("documentDate", event.target.value)} /></label>
                <label>Hora<input disabled={editsLocked} type="time" value={draft.documentTime} onChange={(event) => updateDraft("documentTime", event.target.value)} /></label>
                <label>Emisor<input disabled={editsLocked} value={draft.issuerName} maxLength={300} onChange={(event) => updateDraft("issuerName", event.target.value)} /></label>
                <label>CIF / NIF<input disabled={editsLocked} value={draft.issuerTaxId} maxLength={40} onChange={(event) => updateDraft("issuerTaxId", event.target.value)} /></label>
                <label>Número<input disabled={editsLocked} value={draft.documentNumber} maxLength={120} onChange={(event) => updateDraft("documentNumber", event.target.value)} /></label>
                <label>Periodo<input disabled={editsLocked} value={draft.billingPeriod} maxLength={200} onChange={(event) => updateDraft("billingPeriod", event.target.value)} /></label>
                <label>Base imponible (€)<input disabled={editsLocked} inputMode="decimal" value={draft.taxBase} onChange={(event) => updateDraft("taxBase", event.target.value)} /></label>
                <label>Impuestos (€)<input disabled={editsLocked} inputMode="decimal" value={draft.taxes} onChange={(event) => updateDraft("taxes", event.target.value)} /></label>
                <label>Total (€)<input disabled={editsLocked} inputMode="decimal" value={draft.total} onChange={(event) => updateDraft("total", event.target.value)} /></label>
                <label>Método de pago<input disabled={editsLocked} value={draft.paymentMethod} maxLength={120} onChange={(event) => updateDraft("paymentMethod", event.target.value)} /></label>
              </div>
              <label>Notas<textarea disabled={editsLocked} rows={3} value={draft.notes} maxLength={2000} onChange={(event) => updateDraft("notes", event.target.value)} /></label>

              <div className={ocrStyles.pages} data-testid="ocr-confirmation-lines">
                <div className={ocrStyles.page}>
                  <div className={ocrStyles.pageHeader}>
                    <strong>Líneas del documento</strong>
                    <button className={styles.secondaryButton} type="button" onClick={addLine} disabled={editsLocked}>Añadir línea</button>
                  </div>
                  {draft.lineItems.length ? draft.lineItems.map((line, index) => (
                    <div className={styles.formGrid} key={`${index}-${line.description}`}>
                      <label>Descripción<input disabled={editsLocked} value={line.description} maxLength={500} onChange={(event) => updateLine(index, "description", event.target.value)} /></label>
                      <label>Cantidad<input disabled={editsLocked} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label>
                      <label>Precio unitario (€)<input disabled={editsLocked} inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} /></label>
                      <label>Total línea (€)<input disabled={editsLocked} inputMode="decimal" value={line.total} onChange={(event) => updateLine(index, "total", event.target.value)} /></label>
                      <button className={styles.dangerButton} type="button" onClick={() => removeLine(index)} disabled={editsLocked}>Quitar línea</button>
                    </div>
                  )) : <p className={styles.muted}>No se han detectado líneas. Añádelas sólo si puedes comprobarlas en el original.</p>}
                </div>
              </div>
              <p className={styles.muted}>Corrige y guarda solo lo comprobado en el formulario superior. La lectura OCR original permanece separada y sin sobrescribirse.</p>
              {!ocrRunId ? <div className={ocrStyles.info}>Confirmación bloqueada hasta enlazar esta propuesta con la ejecución OCR persistida.</div> : null}
            </div>
          ) : null}

          <div className={ocrStyles.pages} data-testid="ocr-financial-fields">
            <div className={ocrStyles.page}>
              <div className={ocrStyles.pageHeader}>
                <strong>Datos financieros detectados</strong>
                <span>{review.detectedFinancialFields} detectados · {review.missingFinancialFields} no detectados</span>
              </div>
              <div className={ocrStyles.metrics}>
                {review.financialFields.map((field) => (
                  <div key={field.key} data-testid={`ocr-field-${field.key}`}>
                    <span>{field.label}</span>
                    <strong>{financialFieldValue(field)}</strong>
                    <small>{field.trustLabel}{field.confidence !== null ? ` · ${confidenceLabel(field.confidence)}` : ""}{field.evidenceCount ? ` · ${field.evidenceCount} evidencia` : ""}</small>
                  </div>
                ))}
              </div>
              <p className={styles.muted}>Fiable, Dudoso o No detectado describe la evidencia OCR. No equivale a una confirmación del usuario.</p>
            </div>
          </div>

          {review.financialWarnings.length ? (
            <div className={ocrStyles.warnings} data-testid="ocr-financial-warnings">
              <strong>Validación financiera pendiente</strong>
              <ul>{review.financialWarnings.map((warning) => <li key={warning}>{warningLabel(warning)}</li>)}</ul>
            </div>
          ) : null}

          {result.warnings.length ? (
            <div className={ocrStyles.warnings}>
              <strong>Revisar antes de usar</strong>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warningLabel(warning)}</li>)}</ul>
            </div>
          ) : <div className={ocrStyles.success}>Lectura completada sin avisos técnicos. Aun así, comprueba el documento original antes de confirmar datos.</div>}

          <div className={ocrStyles.readingActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => void copyReading()} disabled={!result.plainText.trim()}>
              {copyState === "copied" ? "Texto copiado ✓" : "Copiar texto leído"}
            </button>
            <span>El original y la lectura OCR permanecen separados de cualquier corrección posterior.</span>
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
                  {page.receiptIntegrity ? (
                    <div className={page.receiptIntegrity.status === "issues" ? ocrStyles.warnings : ocrStyles.info} data-testid={`receipt-integrity-${page.pageNumber}`}>
                      <strong>{page.receiptIntegrity.status === "verified" ? "Coherencia numérica verificada" : page.receiptIntegrity.status === "issues" ? "Incoherencias numéricas detectadas" : "Coherencia numérica parcial"}</strong>
                      <span>{integrityLabel(page.receiptIntegrity)}</span>
                      <small>Comprueba el original igualmente: esta validación detecta contradicciones internas, no sustituye la revisión del documento.</small>
                    </div>
                  ) : null}
                  {page.reviewText || page.layoutText ? <pre className={ocrStyles.layout}>{page.reviewText || page.layoutText}</pre> : <p className={styles.muted}>Sin texto reconstruible en esta página.</p>}
                  <OcrPageReviewWorkbench
                    page={page}
                    preservesGeometry={result.principles.preservesGeometry}
                    openingOriginal={openingOriginal}
                    onOpenOriginal={() => void openOriginal()}
                  />
                </details>
              );
            })}
          </div>

          <div className={ocrStyles.principles}>
            <span>✓ Fuente bancaria solo lectura</span>
            <span>✓ Sin escrituras financieras</span>
            <span>{result.principles.preservesGeometry ? "✓ Geometría preservada" : "⚠ Geometría requiere revisión"}</span>
            <span>✓ Revisión humana obligatoria</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
