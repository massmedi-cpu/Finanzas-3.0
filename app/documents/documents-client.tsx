"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNumberWithDigits } from "../../src/core/formatters";
import { formatMoneyCents, formatMoneyInputCents, parseMoneyInputToCents } from "../../src/core/money";
import {
  authRecoveryFromError,
  requestErrorCode,
  type AuthRecoveryState,
} from "../../src/application/auth-recovery";
import { useActionFeedback } from "../action-feedback";
import { DraftRecoveryNotice } from "../draft-recovery-notice";
import { CategoryIdentity } from "../category-identity";
import { hasExplicitSyntheticDocumentNote } from "../../src/application/document-test-disclosure";
import { OcrReviewBoundary } from "./ocr-review-boundary";
import { OcrReviewPanel } from "./ocr-review-panel";
import { SUPABASE_ORIGIN } from "../../src/infrastructure/auth/supabase-auth";
import styles from "./documents.module.css";

type DocumentType = "ticket" | "invoice" | "other";
type DocumentStatus = "imported" | "pending_review" | "confirmed" | "archived";
type DocumentScope = "ordinary" | "tests" | "all";
type PendingFinalize = { action: "upload_finalize"; type: DocumentType; originalFileName: string; mimeType: string; path: string; sizeBytes: number | null; expectedSha256: string | null };
type PendingPrivateUpload = PendingFinalize & {
  signedUrl: string | null;
  file: File | null;
  storagePutConfirmed: boolean;
};

const PENDING_PRIVATE_UPLOAD_KEY = "financial-app:documents:pending-private-upload:v1";
const PRIVATE_SHA256 = /^[0-9a-f]{64}$/;

async function fileSha256(file: File) {
  // Bound by the 15 MiB upload limit, before a private upload signature is
  // requested. No file bytes or signed Storage credentials are persisted.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// A minimal same-origin recovery handle remains after closing/reopening a
// tab. No document bytes, signed URLs, tokens or auth credentials are stored.
// The old session-only journal is migrated without changing its private path.
// The server still enforces workspace ownership for every finalize request.
function readPrivateUploadJournal(): { present: boolean; pending: PendingPrivateUpload | null } {
  let raw: string | null;
  try {
    const durable = localStorage.getItem(PENDING_PRIVATE_UPLOAD_KEY);
    const previousSession = sessionStorage.getItem(PENDING_PRIVATE_UPLOAD_KEY);
    if (durable === null && previousSession !== null) {
      // Migrate the legacy in-tab handle before accepting a new upload.
      localStorage.setItem(PENDING_PRIVATE_UPLOAD_KEY, previousSession);
    }
    raw = durable ?? previousSession;
  } catch {
    // No durable recovery means a page or browser restart could lose an
    // uncertain write. Fail closed rather than sign a duplicate object.
    return { present: true, pending: null };
  }
  if (raw === null) return { present: false, pending: null };
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.action !== "upload_finalize"
      || !["ticket", "invoice", "other"].includes(value.type)
      || typeof value.originalFileName !== "string"
      || !value.originalFileName.trim() || value.originalFileName.length > 500
      || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(value.mimeType)
      || typeof value.path !== "string"
      || !/^uploads\/[0-9a-f-]+\/[0-9a-f-]+\.(?:pdf|jpg|jpeg|png|webp)$/i.test(value.path)
      || typeof value.storagePutConfirmed !== "boolean"
      || (value.expectedSha256 !== undefined && value.expectedSha256 !== null
        && (typeof value.expectedSha256 !== "string" || !PRIVATE_SHA256.test(value.expectedSha256)))
      || (value.sizeBytes !== undefined && (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 || value.sizeBytes > 15_728_640))) {
      return { present: true, pending: null };
    }
    return {
      present: true,
      pending: {
        action: "upload_finalize",
        type: value.type as DocumentType,
        originalFileName: value.originalFileName,
        mimeType: value.mimeType,
        path: value.path,
        sizeBytes: value.sizeBytes ?? null, // legacy in-tab journal remains recoverable
        expectedSha256: value.expectedSha256 ?? null,
        storagePutConfirmed: value.storagePutConfirmed,
        signedUrl: null,
        file: null,
      },
    };
  } catch {
    // Never discard malformed recovery data and enable a new signed upload.
    return { present: true, pending: null };
  }
}

function writePrivateUploadJournal(pending: PendingPrivateUpload) {
  // Writing must succeed BEFORE bytes leave the browser; otherwise a reload
  // could lose the only deduplication/recovery handle for an uncertain PUT.
  try {
    const value = JSON.stringify({
      version: 1, action: pending.action, type: pending.type,
      originalFileName: pending.originalFileName, mimeType: pending.mimeType,
      path: pending.path, sizeBytes: pending.sizeBytes,
      expectedSha256: pending.expectedSha256,
      storagePutConfirmed: pending.storagePutConfirmed,
    });
    // New uploads have exactly ONE durable handle shared across tabs.
    // Duplicating it in sessionStorage would resurrect stale pending state
    // after another tab successfully finalizes and clears localStorage.
    localStorage.setItem(PENDING_PRIVATE_UPLOAD_KEY, value);
  } catch {
    throw new Error("document_upload_recovery_unavailable");
  }
}

function clearPrivateUploadJournal(confirmed: PendingPrivateUpload) {
  try {
    // Even when the backend confirms successfully, another tab or an
    // extension could replace the journal in the meantime. Never erase a
    // DIFFERENT upload's durable recovery handle.
    const current = readPrivateUploadJournal();
    if (!current.present || !current.pending
      || current.pending.path !== confirmed.path
      || current.pending.expectedSha256 !== confirmed.expectedSha256
      || current.pending.sizeBytes !== confirmed.sizeBytes) {
      throw new Error("document_upload_recovery_unavailable");
    }
    // Never permit another upload until both the old and durable handles
    // are cleared after verified server-side registration.
    localStorage.removeItem(PENDING_PRIVATE_UPLOAD_KEY);
    sessionStorage.removeItem(PENDING_PRIVATE_UPLOAD_KEY);
    if (localStorage.getItem(PENDING_PRIVATE_UPLOAD_KEY) !== null
      || sessionStorage.getItem(PENDING_PRIVATE_UPLOAD_KEY) !== null) {
      throw new Error("document_upload_recovery_unavailable");
    }
  } catch {
    throw new Error("document_upload_recovery_unavailable");
  }
}
type StorageProvider = "supabase" | "google_drive";
type MetadataEditor = {
  type: DocumentType;
  documentDate: string;
  issuerName: string;
  total: string;
  notes: string;
};

type PendingDocumentExit =
  | { type: "document"; id: string }
  | { type: "navigation"; href: string };

type DocumentItem = {
  id: string;
  type: DocumentType;
  notes: string;
  status: DocumentStatus;
  mimeType: string;
  createdAt: string;
  sizeBytes: number | null;
  updatedAt: string;
  issuerName: string | null;
  totalCents: number | null;
  documentDate: string | null;
  storageProvider: StorageProvider;
  associationCount: number;
  originalFileName: string;
  sourceModifiedAt: string | null;
  sourceDriveFileId: string | null;
  isTest?: boolean;
  testDesignationUpdatedAt?: string | null;
  testDesignationReason?: string | null;
};

type DocumentLineItem = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
};

type Association = {
  id: string;
  date: string;
  method: "manual" | "suggested";
  concept: string;
  accountId: string;
  accountName: string;
  confirmed: boolean;
  amountCents: number;
  transactionId: string;
  categoryId: string | null;
  merchantId: string | null;
  merchantName: string | null;
  effectiveKind: string;
  confidence: number;
};

type DocumentDetail = {
  contentDuplicate?: boolean;
  uploadIntegrity?: { sha256: string; sizeBytes: number; verified: boolean };
  contractVersion: 1 | 2 | 3;
  document: Omit<DocumentItem, "associationCount"> & {
    storageKey?: string;
    documentTime?: string | null;
    issuerTaxId?: string | null;
    documentNumber?: string | null;
    billingPeriod?: string | null;
    taxBaseCents?: number | null;
    taxesCents?: number | null;
    paymentMethod?: string | null;
    lineItems?: DocumentLineItem[];
  };
  associations: Association[];
  principles: DocumentPrinciples;
};

type DocumentPrinciples = {
  bankSource: "read_only";
  ocrEnabled: boolean;
  getHasSideEffects: false;
  suggestionsPersisted: false;
  associationsRequireConfirmation: true;
  testDesignationSupported?: boolean;
  testDesignationEditable?: boolean;
};

type DocumentList = {
  contractVersion: 1 | 2 | 3;
  items: DocumentItem[];
  total: number;
  testCount?: number;
  limit: number;
  offset: number;
  principles: DocumentPrinciples;
};

// Trust neither HTTP 200 nor TypeScript assertions as proof that this is a
// valid personal document list. Refuse to render malformed/partial responses
// as a genuine empty archive, and do not discard the previous list.
function validatedDocumentList(payload: unknown): DocumentList {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("document_list_invalid");
  const row = payload as Partial<DocumentList>;
  if (![1, 2, 3].includes(row.contractVersion as number)
    || !Array.isArray(row.items)
    || !Number.isSafeInteger(row.total) || (row.total ?? -1) < 0
    || !Number.isSafeInteger(row.limit) || (row.limit ?? -1) < 1 || (row.limit ?? 101) > 100
    || !Number.isSafeInteger(row.offset) || (row.offset ?? -1) < 0
    || !row.principles || row.principles.bankSource !== "read_only"
    || row.principles.getHasSideEffects !== false
    || row.principles.suggestionsPersisted !== false
    || row.principles.associationsRequireConfirmation !== true
    || row.items.length > (row.limit ?? 0)
    || row.items.length > (row.total ?? 0)
    // An empty page is legitimate beyond the last item, not within it.
    || (row.items.length === 0 && (row.offset ?? 0) < (row.total ?? 0))
    || (row.items.length > 0 && (row.offset ?? 0) + row.items.length > (row.total ?? 0))
    // If more documents exist, every non-final page must contain 'limit'
    // entries. A silently truncated page would otherwise cause the next
    // offset to skip records and make the archive appear complete.
    || ((row.offset ?? 0) + row.items.length < (row.total ?? 0)
      && row.items.length !== row.limit)) {
    throw new Error("document_list_invalid");
  }
  const ids = new Set<string>();
  for (const raw of row.items) {
    if (!raw || typeof raw !== "object") throw new Error("document_list_invalid");
    const item = raw as Partial<DocumentItem>;
    if (typeof item.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
      || ids.has(item.id)
      || !["ticket", "invoice", "other"].includes(item.type ?? "")
      || !["imported", "pending_review", "confirmed", "archived"].includes(item.status ?? "")
      || typeof item.originalFileName !== "string" || !item.originalFileName.trim()
      // A valid document id is not enough: an HTTP 200 can still contain
      // unusable or cross-provider metadata. Never present it as a loaded
      // archive with real files until the minimum display contract is sound.
      || !["supabase", "google_drive"].includes(item.storageProvider ?? "")
      || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(item.mimeType ?? "")
      || typeof item.notes !== "string"
      || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
      || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))
      || (item.sizeBytes !== null && (!Number.isSafeInteger(item.sizeBytes) || (item.sizeBytes ?? -1) < 0))
      || (item.issuerName !== null && typeof item.issuerName !== "string")
      || (item.totalCents !== null && !Number.isSafeInteger(item.totalCents))
      || (item.documentDate !== null && (typeof item.documentDate !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(item.documentDate)
        || formatDate(item.documentDate) === "Fecha no válida"))
      // A malformed test designation must not silently turn a test fixture
      // into an ordinary personal document in the archive UI.
      || (item.isTest !== undefined && typeof item.isTest !== "boolean")
      || !Number.isSafeInteger(item.associationCount) || (item.associationCount ?? -1) < 0) {
      throw new Error("document_list_invalid");
    }
    ids.add(item.id);
  }
  return row as DocumentList;
}

// The finalized record must be for this exact private object. A successful
// HTTP response for an unrelated document cannot release an upload lock.
function validatedFinalizedUpload(payload: unknown, pending: PendingFinalize): DocumentDetail {
  const data = payload as DocumentDetail | null;
  const canonicalDuplicate = data?.contentDuplicate === true && pending.expectedSha256 !== null;
  if (!data || ![1, 2, 3].includes(data.contractVersion)
    || !data.document || typeof data.document.id !== "string" || !DOCUMENT_UUID.test(data.document.id)
    || data.document.storageProvider !== "supabase"
    || data.document.storageKey !== pending.path
    || (!canonicalDuplicate && (data.document.originalFileName !== pending.originalFileName
      || data.document.type !== pending.type))
    || (canonicalDuplicate && (!data.document.originalFileName?.trim()
      || !["ticket", "invoice", "other"].includes(data.document.type)))
    || data.document.mimeType !== pending.mimeType
    || (pending.sizeBytes !== null && data.document.sizeBytes !== pending.sizeBytes)
    || (pending.expectedSha256 !== null && (
      data.uploadIntegrity?.verified !== true
      || data.uploadIntegrity.sha256 !== pending.expectedSha256
      || data.uploadIntegrity.sizeBytes !== pending.sizeBytes
    ))
    || !data.principles || data.principles.bankSource !== "read_only"
    || data.principles.getHasSideEffects !== false || data.principles.suggestionsPersisted !== false
    || data.principles.associationsRequireConfirmation !== true) {
    throw new Error("document_upload_unverified");
  }
  return data;
}

type Candidate = {
  transactionId: string;
  date: string;
  concept: string;
  accountId: string;
  accountName: string;
  amountCents: number;
  categoryId: string | null;
  merchantId: string | null;
  merchantName: string | null;
  confidence: number;
  dayDifference: number;
  amountDifferenceCents: number;
  effectiveKind: string;
};

type CandidateResponse = {
  contractVersion: 1;
  documentId: string;
  ready: boolean;
  reason: string | null;
  days: number;
  amountToleranceCents: number;
  candidates: Candidate[];
  principles: { bankSource: "read_only"; requiresConfirmation: true; suggestionsPersisted: false };
};


const DOCUMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validAssociation(value: unknown): value is Association {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<Association>;
  return typeof row.id === "string" && DOCUMENT_UUID.test(row.id)
    && typeof row.transactionId === "string" && DOCUMENT_UUID.test(row.transactionId)
    && typeof row.accountId === "string" && DOCUMENT_UUID.test(row.accountId)
    && (row.method === "manual" || row.method === "suggested")
    && typeof row.confirmed === "boolean"
    && typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && typeof row.concept === "string" && typeof row.accountName === "string"
    && Number.isSafeInteger(row.amountCents);
}

function validatedCandidateResponse(payload: unknown, documentId: string): CandidateResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("document_suggestions_invalid");
  const data = payload as Partial<CandidateResponse>;
  if (data.contractVersion !== 1 || data.documentId !== documentId || typeof data.ready !== "boolean"
    || !Array.isArray(data.candidates) || data.candidates.length > 20
    || !data.principles || data.principles.bankSource !== "read_only"
    || data.principles.requiresConfirmation !== true || data.principles.suggestionsPersisted !== false) {
    throw new Error("document_suggestions_invalid");
  }
  const seen = new Set<string>();
  for (const candidate of data.candidates) {
    if (!candidate || typeof candidate !== "object"
      || typeof candidate.transactionId !== "string" || !DOCUMENT_UUID.test(candidate.transactionId)
      || seen.has(candidate.transactionId)
      || typeof candidate.accountId !== "string" || !DOCUMENT_UUID.test(candidate.accountId)
      || !Number.isSafeInteger(candidate.amountCents)
      || typeof candidate.concept !== "string" || typeof candidate.accountName !== "string"
      || typeof candidate.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)
      || typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence)
      || candidate.confidence < 0 || candidate.confidence > 1
      || !Number.isSafeInteger(candidate.amountDifferenceCents)
      || !Number.isSafeInteger(candidate.dayDifference)
      || typeof candidate.effectiveKind !== "string"
      || (candidate.categoryId != null && (typeof candidate.categoryId !== "string" || !DOCUMENT_UUID.test(candidate.categoryId)))
      || (candidate.merchantId != null && (typeof candidate.merchantId !== "string" || !DOCUMENT_UUID.test(candidate.merchantId)))) {
      throw new Error("document_suggestions_invalid");
    }
    seen.add(candidate.transactionId);
  }
  return data as CandidateResponse;
}

type TransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  account: { id: string; name: string };
  concept: { original: string; processed: string; effective: string };
  merchant: { effectiveName: string | null };
  category: { effectiveId: string | null; effectiveName: string | null };
  kind: { effective: string };
};

type TransactionSearch = {
  rows: TransactionRow[];
  totalCount: number;
};

// Never display an untrusted HTTP payload as selectable bank transactions.
// An invalid account/category shape could otherwise render a misleading
// association target or crash the document detail.
function validatedTransactionSearch(value: unknown): TransactionSearch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("document_transactions_invalid");
  const result = value as Partial<TransactionSearch>;
  if (!Array.isArray(result.rows) || result.rows.length > 20 || !Number.isSafeInteger(result.totalCount)
    || (result.totalCount ?? -1) < 0 || result.rows.length > (result.totalCount ?? -1)) {
    throw new Error("document_transactions_invalid");
  }
  const seen = new Set<string>();
  for (const raw of result.rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("document_transactions_invalid");
    const row = raw as Partial<TransactionRow>;
    if (typeof row.id !== "string" || !DOCUMENT_UUID.test(row.id) || seen.has(row.id)
      || typeof row.bankDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.bankDate)
      || !Number.isSafeInteger(row.amountCents)
      || !row.account || typeof row.account.id !== "string" || !DOCUMENT_UUID.test(row.account.id)
      || typeof row.account.name !== "string"
      || !row.concept || typeof row.concept.effective !== "string"
      || !row.category || (row.category.effectiveId != null
        && (typeof row.category.effectiveId !== "string" || !DOCUMENT_UUID.test(row.category.effectiveId)))
      || (row.category.effectiveName != null && typeof row.category.effectiveName !== "string")
      || !row.kind || typeof row.kind.effective !== "string") {
      throw new Error("document_transactions_invalid");
    }
    seen.add(row.id);
  }
  return result as TransactionSearch;
}

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1UCUZSmOWfGM5VyvhDcx7ExeBw3LS872t";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DOCUMENT_READ_TIMEOUT_MS = 20_000;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const TYPE_LABELS: Record<DocumentType, string> = {
  ticket: "Ticket",
  invoice: "Factura",
  other: "Otro",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  imported: "Importado",
  pending_review: "Pendiente de revisar",
  confirmed: "Confirmado",
  archived: "Archivado",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const iso = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Fecha no válida";
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return "Fecha no válida";
  return dateFormatter.format(parsed);
}

function formatBytes(value: number | null) {
  if (value === null) return "Tamaño no disponible";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${formatNumberWithDigits(value / 1024, 1, 0)} KB`;
  return `${formatNumberWithDigits(value / 1024 / 1024, 1, 0)} MB`;
}

function euroInput(cents: number | null) {
  if (cents === null) return "";
  return formatMoneyInputCents(Math.abs(cents));
}

function parseEuroToCents(input: string) {
  if (!input.trim()) return null;
  try {
    const cents = parseMoneyInputToCents(input);
    return cents >= 0 ? cents : undefined;
  } catch {
    return undefined;
  }
}

function editorFromDocument(document: DocumentDetail["document"]): MetadataEditor {
  return {
    type: document.type,
    documentDate: document.documentDate ?? "",
    issuerName: document.issuerName ?? "",
    total: euroInput(document.totalCents),
    notes: document.notes ?? "",
  };
}

function editorMatchesDocument(editor: MetadataEditor, document: DocumentDetail["document"]) {
  const saved = editorFromDocument(document);
  return editor.type === saved.type
    && editor.documentDate === saved.documentDate
    && editor.issuerName === saved.issuerName
    && editor.total === saved.total
    && editor.notes === saved.notes;
}

async function getDocumentJson(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DOCUMENT_READ_TIMEOUT_MS);
  try {
    return await readJson(await fetch(url, { cache: "no-store", signal: controller.signal }));
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // An upstream failure can be a 401/429/503 without a JSON body. Keep
    // the meaningful HTTP classification instead of a generic "request_failed".
    const code = requestErrorCode(body);
    if (code !== "request_failed") throw new Error(code);
    if (response.status === 401) throw new Error("authentication_required");
    if (response.status === 429) throw new Error("document_rate_limited");
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error("document_service_unavailable");
    }
    throw new Error("document_request_failed");
  }
  return body;
}

function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La solicitud documental ha superado el tiempo de espera. Si intentabas guardar o asociar, el resultado podría haberse aplicado: comprueba el detalle antes de repetir la operación.";
  }
  const code = error instanceof Error ? error.message : "request_failed";
  const labels: Record<string, string> = {
    document_owner_review_required: "El propietario debe revisar el documento antes de cambiar su tratamiento.",
    invalid_document_owner_review: "Confirma que has revisado el documento y su procedencia.",
    invalid_document_designation_reason: "Explica el motivo del cambio (hasta 500 caracteres).",
    document_test_designation_incomplete: "No se ha podido comprobar el cambio de tratamiento. Conservamos tu revisión para que puedas reintentarlo.",
    document_revalidation_incomplete: "La operación puede haberse aplicado, pero no se pudo verificar al recargar. Actualiza el documento antes de repetirla.",
    document_detail_mismatch: "El servidor no ha devuelto el documento solicitado. No mostraremos datos de otro documento; reintenta la consulta.",
    document_open_blocked: "El navegador ha bloqueado la ventana del documento. Permite ventanas emergentes para Financial App y vuelve a pulsar Abrir.",
    document_open_failed: "No se ha podido abrir el original. Reintenta desde la ficha del documento.",
    document_open_unsafe_url: "Se ha rechazado un enlace de archivo no seguro. El original no se ha abierto.",
    document_suggestions_invalid: "Las sugerencias no corresponden a este documento o no cumplen los requisitos de seguridad. No se ha asociado ningún movimiento.",
    document_transactions_invalid: "La búsqueda de movimientos ha devuelto datos incompletos. No se puede asociar un resultado sin verificar; vuelve a buscar.",
    invalid_document_size: "El archivo debe ocupar entre 1 byte y 15 MB.",
    unsupported_document_mime_type: "Formato no admitido. Usa PDF, JPG, PNG o WebP.",
    invalid_document_date: "La fecha del documento no es válida.",
    invalid_document_total: "El importe del documento no es válido.",
    document_upload_not_found: "La subida no llegó a completarse en el almacenamiento privado.",
    document_upload_unsafe_url: "El servidor ha devuelto un destino de subida que no pertenece al almacenamiento privado autorizado. No se ha enviado el archivo.",
    document_upload_unverified: "No se ha podido comprobar la identidad del documento guardado. Recupera la misma ruta antes de volver a subir el archivo.",
    document_upload_integrity_unsupported: "El servidor documental aún no admite la verificación segura SHA-256. El original no se ha enviado; es necesario actualizar el backend de la candidata antes de permitir subidas.",
    document_upload_recovery_unavailable: "El navegador no permite guardar de forma segura la referencia de recuperación. No se ha enviado el original. Comprueba los permisos de almacenamiento de esta pestaña antes de reintentarlo.",
    document_upload_mime_mismatch: "El archivo subido no coincide con el tipo declarado.",
    document_suggestion_not_current: "La sugerencia ya no coincide con los datos actuales. Vuelve a buscar candidatos.",
    document_suggestion_metadata_required: "Añade fecha e importe para generar sugerencias.",
    authentication_required: "Tu sesión necesita renovarse. Inicia sesión y pulsa Reintentar lista. Si acababas de guardar algún cambio, comprueba su estado antes de repetirlo.",
    authentication_unavailable: "El acceso seguro no está disponible temporalmente. Si habías iniciado un guardado, consulta su estado antes de repetirlo.",
    oidc_unavailable: "No se ha podido verificar la identidad segura del servidor. No se confirma el resultado de ninguna operación; comprueba el estado antes de repetir un cambio.",
    gateway_identity_unavailable: "El servidor no ha podido acreditar su identidad ante el archivo financiero. No es un problema de tu contraseña; verifica el estado antes de repetir cualquier operación.",
    persistence_failed: "No se ha podido confirmar la operación documental por un problema de persistencia. Si estabas guardando cambios, comprueba el detalle antes de repetir; también puedes pulsar Reintentar lista.",
    document_service_unavailable: "El servicio documental no responde en este momento. Si estabas guardando cambios, comprueba primero su estado antes de volver a intentarlo.",
    document_rate_limited: "Se han alcanzado demasiadas consultas documentales. Espera un momento antes de pulsar Reintentar lista.",
    document_request_failed: "No se ha podido confirmar la operación documental. Comprueba tu conexión y el estado del documento antes de repetir un cambio; puedes pulsar Reintentar lista.",
    document_filter_limit: "La búsqueda abarca demasiados documentos. Reduce los filtros antes de volver a cargarla.",
    document_filter_incomplete: "La lista recibida está incompleta. No mostramos un resultado parcial como si fuera el definitivo; reintenta la carga.",
    document_list_invalid: "El servidor ha devuelto una lista documental incompleta o incompatible. No se mostrará como si estuviera vacía; reintenta la consulta.",
  };
  return labels[code] ?? "No se pudo completar la operación documental.";
}

function documentActionPendingLabel(action: string) {
  if (action === "upload") return "Guardando documento de forma privada…";
  if (action === "metadata") return "Guardando metadatos revisados…";
  if (action.startsWith("status-")) return "Actualizando estado documental…";
  if (action === "open") return "Abriendo documento…";
  if (action === "candidates") return "Buscando movimientos candidatos…";
  if (action.startsWith("associate-")) return "Asociando movimiento…";
  if (action.startsWith("unassociate-")) return "Eliminando asociación…";
  if (action === "manual-search") return "Buscando movimientos…";
  return "Procesando operación documental…";
}

function documentActionSuccessLabel(action: string) {
  if (action === "upload") return "Documento guardado de forma privada.";
  if (action === "metadata") return "Metadatos guardados.";
  if (action.startsWith("status-")) return "Estado documental actualizado.";
  if (action === "open") return "Documento abierto.";
  if (action === "candidates") return "Búsqueda de movimientos completada.";
  if (action.startsWith("associate-")) return "Movimiento asociado. La fuente bancaria no se ha modificado.";
  if (action.startsWith("unassociate-")) return "Asociación eliminada. La fuente bancaria no se ha modificado.";
  if (action === "manual-search") return "Búsqueda de movimientos completada.";
  return "Operación documental completada.";
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`${styles.status} ${styles[`status_${status}`]}`}>{STATUS_LABELS[status]}</span>;
}

export function DocumentsClient({ initialStatusFilter = "", initialUnassociatedFilter = false, initialScope = "ordinary", initialOffset = 0 }: {
  initialStatusFilter?: string;
  initialUnassociatedFilter?: boolean;
  initialScope?: DocumentScope;
  initialOffset?: number;
}) {
  const actionFeedback = useActionFeedback();
  const [list, setList] = useState<DocumentList | null>(null);
  const [loadedListKey, setLoadedListKey] = useState<string | null>(null);
  const [listLoadFailed, setListLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [candidates, setCandidates] = useState<CandidateResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionSearch | null>(null);
  const [transactionResultQuery, setTransactionResultQuery] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [unassociatedOnly, setUnassociatedOnly] = useState(initialUnassociatedFilter);
  const [scope, setScope] = useState<DocumentScope>(initialScope);
  const [offset, setOffset] = useState(initialOffset);
  const [designationReason, setDesignationReason] = useState("");
  const [designationReviewed, setDesignationReviewed] = useState(false);
  const [designationOpen, setDesignationOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailLoadFailed, setDetailLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRecovery, setAuthRecovery] = useState<AuthRecoveryState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<DocumentType>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [uploadUnverified, setUploadUnverified] = useState(false);
  const [editor, setEditor] = useState<MetadataEditor>({ type: "invoice", documentDate: "", issuerName: "", total: "", notes: "" });
  const [pendingExit, setPendingExit] = useState<PendingDocumentExit | null>(null);
  const hasActiveListFilters = Boolean(query.trim() || statusFilter || unassociatedOnly || scope !== "ordinary");
  const metadataDirty = useMemo(
    () => Boolean(detail && !editorMatchesDocument(editor, detail.document)),
    [detail, editor],
  );

  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const originalOpenInFlight = useRef(false);
  const uploadInFlight = useRef(false);
  // Close the microtask gap between a click and acquisition of Web Locks.
  const uploadLockPendingRef = useRef(false);
  // An in-memory File and its signed URL are used only in the current tab
  // lifecycle. The minimal journal survives reloads to prevent duplicates.
  const unverifiedFinalizeRef = useRef<PendingPrivateUpload | null>(null);

  useEffect(() => {
    const syncExternalPending = () => {
      // A storage event is delivered to OTHER tabs, not to the initiating tab.
      // Never replace the active tab's in-memory File or signed upload token.
      if (uploadInFlight.current) return;
      const recovery = readPrivateUploadJournal();
      unverifiedFinalizeRef.current = recovery.pending;
      setUploadUnverified(recovery.present);
      if (recovery.present) {
        setNotice(recovery.pending
          ? "Hay un envío privado sin confirmar en este navegador. Puedes recuperar la misma ruta aunque hayas cerrado la pestaña."
          : "La referencia de recuperación no es legible. Se bloquean nuevos envíos para proteger tus documentos.");
      } else {
        // Another tab verified the original; do not leave this one blocked
        // against a stale recovery reference.
        setNotice((previous) => previous?.startsWith("Hay un envío privado sin confirmar")
          || previous?.startsWith("La referencia de recuperación no es legible") ? null : previous);
      }
    };
    syncExternalPending();
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && event.key === PENDING_PRIVATE_UPLOAD_KEY) {
        syncExternalPending();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  const associationMutationInFlight = useRef(false);
  const manualSearchSequence = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const feedbackActionRef = useRef<string | null>(null);
  const metadataDirtyRef = useRef(false);
  const bypassUnloadOnceRef = useRef(false);
  const exitReturnFocusRef = useRef<HTMLElement | null>(null);
  selectedIdRef.current = selectedId;
  metadataDirtyRef.current = metadataDirty;

  // Una consulta por pausa de escritura; evita descargar la lista en cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    params.set("scope", scope);
    if (unassociatedOnly) params.set("unassociated", "true");
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (statusFilter) params.set("status", statusFilter);
    return `/api/documents?${params}`;
  }, [debouncedQuery, statusFilter, scope, unassociatedOnly, offset]);

  const loadList = useCallback(async (url = listUrl, silent = false) => {
    const sequence = ++listSequence.current;
    const requested = new URL(url, window.location.origin);
    const requestKey = `${requested.pathname}${requested.search}`;
    setListLoadFailed(false);
    if (!silent) setLoadingList(true);
    setError(null);
    try {
      const first = validatedDocumentList(await getDocumentJson(url));
      // Do not replace this page with a structurally valid response to
      // a different request, which could hide documents or move pagination.
      if (first.offset !== Number(requested.searchParams.get("offset") ?? "0")
        || first.limit !== Number(requested.searchParams.get("limit") ?? "50")) {
        throw new Error("document_list_invalid");
      }
      let data = first;
      if (requested.searchParams.get("unassociated") === "true" && first.contractVersion < 3) {
        // Legacy responses do not filter unassociated documents server-side.
        // Always inventory from offset zero: starting at the requested page
        // silently skipped earlier records and duplicated later ones.
        const parsed = new URL(url, window.location.origin);
        parsed.searchParams.set("limit", "100");
        parsed.searchParams.set("offset", "0");
        const base = validatedDocumentList(await getDocumentJson(parsed.toString()));
        if (base.contractVersion !== first.contractVersion
          || base.total !== first.total || base.offset !== 0 || base.limit !== 100
          || base.total > 10_000) {
          throw new Error("document_filter_incomplete");
        }
        const all = [...base.items];
        const ids = new Set(all.map((item) => item.id));
        while (all.length < base.total) {
          parsed.searchParams.set("offset", String(all.length));
          const next = validatedDocumentList(await getDocumentJson(parsed.toString()));
          if (next.contractVersion !== base.contractVersion
            || next.total !== base.total || next.offset !== all.length || next.limit !== 100
            || !next.items.length || next.items.some((item) => ids.has(item.id))) {
            throw new Error("document_filter_incomplete");
          }
          for (const item of next.items) ids.add(item.id);
          all.push(...next.items);
        }
        // Two non-atomic reads may observe different repository revisions.
        // A changed page invalidates the reconstructed snapshot rather than
        // silently mixing two archives and skipping or duplicating records.
        const originalWindow = all.slice(first.offset, first.offset + first.limit);
        if (originalWindow.length !== first.items.length
          || first.items.some((item, index) => {
            const original = originalWindow[index];
            return !original || original.id !== item.id
              || original.status !== item.status
              || original.associationCount !== item.associationCount
              || original.updatedAt !== item.updatedAt
              || original.type !== item.type
              || original.totalCents !== item.totalCents
              || original.documentDate !== item.documentDate
              || original.issuerName !== item.issuerName
              || original.originalFileName !== item.originalFileName
              || original.storageProvider !== item.storageProvider
              || original.isTest !== item.isTest;
          })) {
          throw new Error("document_filter_incomplete");
        }
        // When the owner explicitly requests archived documents, do not
        // remove them merely because the backend uses an older contract.
        const filtered = all.filter((item) => item.associationCount === 0
          && (requested.searchParams.get("status") === "archived" || item.status !== "archived"));
        // Keep the requested page and its 50-row limit. Returning the entire
        // archive as a single page defeated navigation and mobile rendering.
        data = {
          ...first,
          items: filtered.slice(first.offset, first.offset + first.limit),
          total: filtered.length,
          offset: first.offset,
          limit: first.limit,
        };
      }
      if (sequence !== listSequence.current) return false;
      if (data.offset > 0 && data.items.length === 0) {
        setOffset(0);
        return false;
      }
      setList(data);
      setLoadedListKey(requestKey);
      setListLoadFailed(false);
      if (
        selectedIdRef.current
        && !data.items.some((item) => item.id === selectedIdRef.current)
        && !metadataDirtyRef.current
      ) {
        setSelectedId(null);
        setDetail(null);
      }
      return true;
    } catch (caught) {
      if (sequence === listSequence.current) {
        setListLoadFailed(true);
        setError(friendlyError(caught));
      }
      return false;
    } finally {
      if (sequence === listSequence.current) setLoadingList(false);
    }
  }, [listUrl]);

  const loadDetail = useCallback(async (id: string, silent = false, preserveEditor = false) => {
    const sequence = ++detailSequence.current;
    if (!silent) {
      setLoadingDetail(true);
      setDetailLoadFailed(false);
    }
    setError(null);
    if (!silent) {
      setCandidates(null);
      setTransactions(null);
      setTransactionResultQuery(null);
      manualSearchSequence.current += 1;
    }
    try {
      const data = await getDocumentJson(`/api/documents?id=${encodeURIComponent(id)}`) as DocumentDetail;
      if (sequence !== detailSequence.current || selectedIdRef.current !== id) return null;
      if (!data?.document || data.document.id !== id || !Array.isArray(data.associations)
        || ![1, 2, 3].includes(data.contractVersion)
        || !data.associations.every(validAssociation)
        || !data.principles || data.principles.bankSource !== "read_only"
        || data.principles.getHasSideEffects !== false
        || data.principles.suggestionsPersisted !== false
        || data.principles.associationsRequireConfirmation !== true
        || !["ticket", "invoice", "other"].includes(data.document.type)
        || !["imported", "pending_review", "confirmed", "archived"].includes(data.document.status)
        || (data.document.totalCents !== null && !Number.isSafeInteger(data.document.totalCents))
        || typeof data.document.originalFileName !== "string"
        || !data.document.originalFileName.trim()) {
        throw new Error("document_detail_mismatch");
      }
      setDetail(data);
      if (!preserveEditor) {
        setDesignationOpen(false);
        setDesignationReason("");
        setDesignationReviewed(false);
      }
      if (!preserveEditor) setEditor(editorFromDocument(data.document));
      return data;
    } catch (caught) {
      if (sequence === detailSequence.current && selectedIdRef.current === id) {
        if (!silent) setDetailLoadFailed(true);
        setError(friendlyError(caught));
      }
      return null;
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    const refreshAfterDrive = () => { void loadList(listUrl, true); };
    window.addEventListener("financial-app:documents-drive-updated", refreshAfterDrive);
    return () => window.removeEventListener("financial-app:documents-drive-updated", refreshAfterDrive);
  }, [loadList, listUrl]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope === "ordinary") params.delete("scope"); else params.set("scope", scope);
    if (statusFilter) params.set("status", statusFilter); else params.delete("status");
    if (unassociatedOnly) params.set("unassociated", "true"); else params.delete("unassociated");
    if (offset > 0) params.set("offset", String(offset)); else params.delete("offset");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `/documents${search ? `?${search}` : ""}`);
  }, [scope, statusFilter, unassociatedOnly, offset]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (busy) {
      feedbackActionRef.current = busy;
      actionFeedback.begin(`documents:${busy}`, documentActionPendingLabel(busy));
      return;
    }
    const completed = feedbackActionRef.current;
    if (!completed) return;
    const feedbackId = `documents:${completed}`;
    if (error) actionFeedback.error(feedbackId, error);
    else actionFeedback.success(feedbackId, documentActionSuccessLabel(completed));
    feedbackActionRef.current = null;
  }, [actionFeedback, busy, error]);

  useEffect(() => {
    // React can unmount during a private PUT or a pending finalize when a
    // navigation starts. Session metadata then survives, but the original File
    // and signed URL do not. Prevent SPA navigation DURING the write; warn
    // on full page unload with either a write or unresolved journal.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const recoveryPresent = readPrivateUploadJournal().present;
      if (bypassUnloadOnceRef.current && !uploadLockPendingRef.current && !uploadInFlight.current && !recoveryPresent) return;
      if (!metadataDirtyRef.current && !uploadLockPendingRef.current && !uploadInFlight.current && !recoveryPresent) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const protectInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!metadataDirtyRef.current && !uploadLockPendingRef.current && !uploadInFlight.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      if (destination.pathname === current.pathname && destination.search === current.search) return;

      event.preventDefault();
      event.stopPropagation();
      if (uploadLockPendingRef.current || uploadInFlight.current) {
        setError("Hay un envío de documento en curso. Termina o recupera esa misma subida antes de cambiar de página; así no se pierde el original ni se crea una copia.");
        return;
      }
      exitReturnFocusRef.current = anchor;
      setPendingExit({ type: "navigation", href: destination.href });
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", protectInternalNavigation, true);
    };
  }, []);

  const selectDocument = (id: string) => {
    if (id === selectedIdRef.current || busy) return;
    if (metadataDirtyRef.current) {
      exitReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingExit({ type: "document", id });
      return;
    }
    setAuthRecovery(null);
    selectedIdRef.current = id;
    setSelectedId(id);
  };

  const continueDocumentExit = (target: PendingDocumentExit) => {
    setPendingExit(null);
    metadataDirtyRef.current = false;
    if (target.type === "document") {
      if (detail) setEditor(editorFromDocument(detail.document));
      setAuthRecovery(null);
      selectedIdRef.current = target.id;
      setSelectedId(target.id);
      return;
    }
    bypassUnloadOnceRef.current = true;
    window.location.assign(target.href);
  };

  const refreshAfterMutation = useCallback(async (id: string, preserveEditor = false) => {
    const [, verifiedDetail] = await Promise.all([loadList(), loadDetail(id, false, preserveEditor)]);
    return verifiedDetail?.document.id === id ? verifiedDetail : null;
  }, [loadList, loadDetail]);

  const refreshAfterOcrConfirmation = useCallback(async (id: string) => {
    const [listVerified, verifiedDetail] = await Promise.all([
      loadList(listUrl, true), loadDetail(id, true, true),
    ]);
    // Both readers handle transport errors locally; their promises can
    // resolve even when one failed. Never claim the whole document was
    // synchronized merely because Promise.all completed.
    if (listVerified !== true || verifiedDetail?.document.id !== id) {
      throw new Error("document_post_confirmation_refresh_failed");
    }
    setNotice("Revisión OCR confirmada y documento sincronizado.");
  }, [listUrl, loadList, loadDetail]);

  async function verifyUncertainUpload() {
    if (!uploadUnverified || busy || uploadInFlight.current || uploadLockPendingRef.current) return;
    // Re-finalization is idempotent for the same path, but clearing its
    // journal must not race with another tab acquiring a new upload path.
    // Use the SAME lock as uploadDocument, including the clear operation.
    if (!navigator.locks?.request) {
      setError("Este navegador no dispone del bloqueo seguro entre pestañas. Recupera el documento desde un navegador actualizado, sin subir otra copia.");
      return;
    }
    uploadLockPendingRef.current = true;
    try {
      await navigator.locks.request(PENDING_PRIVATE_UPLOAD_KEY, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          setError("Otra pestaña está gestionando un documento. Comprueba la recuperación allí antes de repetirla aquí.");
          return;
        }
        await verifyUncertainUploadExclusive();
      });
    } catch {
      setError("No se ha podido proteger la recuperación entre pestañas. El original sigue bloqueado; no generes un envío nuevo.");
    } finally {
      uploadLockPendingRef.current = false;
    }
  }

  async function verifyUncertainUploadExclusive() {
    if (!uploadUnverified || busy || uploadInFlight.current) return;
    const pending = unverifiedFinalizeRef.current;
    if (!pending) {
      setError("La referencia de recuperación es ilegible. No vuelvas a enviar el original; comprueba los documentos y solicita una revisión antes de generar otra subida.");
      return;
    }
    // A list of the first 50 documents cannot prove an uncertain finalize
    // was not committed. Re-finalize the SAME private object instead of
    // creating another signed path and uploading a duplicate.
    uploadInFlight.current = true;
    setBusy("upload-verify");
    setError(null);
    setNotice(null);
    try {
      if (!pending.storagePutConfirmed && pending.file && pending.signedUrl) {
        // Within the original page lifetime, re-try the same object only.
        // After a reload these sensitive values are not persisted: instead,
        // ask the server to verify whether the prior PUT reached Storage.
        try {
          const form = new FormData();
          form.append("cacheControl", "3600");
          form.append("", pending.file);
          const put = await fetch(pending.signedUrl, {
            method: "PUT", headers: { "x-upsert": "false" }, body: form,
          });
          if (put.ok) {
            pending.storagePutConfirmed = true;
            writePrivateUploadJournal(pending);
          }
        } catch {
          // Network uncertainty does not establish that the object is absent.
        }
      }
      const result = await readJson(await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: pending.action, type: pending.type,
          originalFileName: pending.originalFileName,
          mimeType: pending.mimeType, path: pending.path,
          expectedSizeBytes: pending.sizeBytes, expectedSha256: pending.expectedSha256,
        }),
      }));
      const confirmed = validatedFinalizedUpload(result, pending);
      clearPrivateUploadJournal(pending);
      unverifiedFinalizeRef.current = null;
      setUploadUnverified(false);
      setFile(null);
      for (const inputId of ["document-file", "document-camera"]) {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (input) input.value = "";
      }
      setScope("ordinary");
      setStatusFilter("");
      setUnassociatedOnly(false);
      setQuery("");
      setDebouncedQuery("");
      setOffset(0);
      await loadList("/api/documents?limit=50&offset=0&scope=ordinary");
      if (metadataDirtyRef.current) {
        setPendingExit({ type: "document", id: confirmed.document.id });
        setNotice("El registro se ha confirmado sobre la misma ruta privada, sin crear una copia nueva. Resuelve los cambios pendientes antes de abrir su ficha.");
      } else {
        selectedIdRef.current = confirmed.document.id;
        setSelectedId(confirmed.document.id);
        setNotice(confirmed.contentDuplicate
          ? "Archivo idéntico ya registrado desde otro dispositivo. Se reutiliza el original existente, sin modificarlo."
          : "Registro del original confirmado en la misma ruta privada, sin crear una copia nueva. El OCR sólo se ejecutará si lo solicitas.");
      }
    } catch {
      setUploadUnverified(true);
      setError(pending.file
        ? "No se ha podido confirmar la misma ruta privada. Sigue bloqueada para evitar copias duplicadas; puedes reintentar su recuperación sin crear otro archivo."
        : "El servidor aún no ha confirmado el archivo de la sesión anterior. La referencia privada sigue protegida; no se creará otra subida. Si no llegó al almacenamiento, hará falta resolver la incidencia sin duplicar el original.");
    } finally {
      uploadInFlight.current = false;
      setBusy(null);
    }
  }

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (busy || uploadInFlight.current || uploadLockPendingRef.current) return;
    // localStorage is not atomic across browser tabs: two tabs can both read
    // an empty journal and sign independent private objects before either
    // writes. Acquire an exclusive same-origin Web Lock BEFORE reading it.
    // Without that primitive we do not risk sending a second original.
    if (!navigator.locks?.request) {
      setError("Este navegador no dispone del bloqueo seguro entre pestañas. No se ha enviado el archivo; utiliza un navegador actualizado para evitar duplicados.");
      return;
    }
    uploadLockPendingRef.current = true;
    try {
      await navigator.locks.request(PENDING_PRIVATE_UPLOAD_KEY, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          setError("Otra pestaña está gestionando un documento. Termina ese envío antes de iniciar otro; no se ha firmado ni subido este archivo.");
          return;
        }
        // Holding the lock until the private PUT and verified finalize finish
        // makes the initial journal read/sign/write critical section atomic
        // with respect to all other cooperating tabs of this origin.
        await uploadDocumentExclusive();
      });
    } catch {
      setError("No se ha podido asegurar el bloqueo entre pestañas. No se iniciará un nuevo envío hasta que puedas comprobar el original anterior.");
    } finally {
      uploadLockPendingRef.current = false;
    }
  }

  async function uploadDocumentExclusive() {
    if (busy || uploadInFlight.current) return;
    // Read the journal synchronously as well: no event can sign a new path
    // before the mount effect restores a pending upload on hydration.
    const existingUpload = readPrivateUploadJournal();
    if (uploadUnverified || existingUpload.present) {
      unverifiedFinalizeRef.current ??= existingUpload.pending;
      setUploadUnverified(true);
      setError("La subida anterior no está confirmada. Recupera primero esa misma ruta privada antes de intentar otra.");
      return;
    }
    if (!file) {
      setError("Selecciona un PDF, una imagen o haz una foto.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setError("El archivo debe ocupar entre 1 byte y 15 MB.");
      return;
    }
    uploadInFlight.current = true;
    setBusy("upload");
    setError(null);
    setNotice(null);
    // Once the original reaches private Storage, a failed finalize response
    // cannot prove whether the document record was created on the server.
    let privatePutAttempted = false;
    let attemptedPrivateUpload: PendingPrivateUpload | null = null;
    try {
      const expectedSha256 = await fileSha256(file);
      const sign = await readJson(await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upload_sign", type: uploadType, originalFileName: file.name,
          mimeType: file.type, sizeBytes: file.size, expectedSha256,
        }),
      }));

      // A content-identical original may already be registered by ANOTHER
      // device. The server reports the canonical document instead of signing
      // another upload; never send a second copy or rewrite its metadata.
      if (sign?.alreadyRegistered === true) {
        if (sign.contentAddressVersion !== 1 || sign.hashVerificationVersion !== 1
          || sign.hashAlgorithm !== "sha256" || sign.expectedSha256 !== expectedSha256
          || sign.mimeType !== file.type || sign.sizeBytes !== file.size
          || typeof sign.documentId !== "string" || !DOCUMENT_UUID.test(sign.documentId)
          || typeof sign.path !== "string"
          || !/^uploads\/[0-9a-f-]+\/[0-9a-f-]+\.(?:pdf|jpg|jpeg|png|webp)$/i.test(sign.path)
          || !["ticket", "invoice", "other"].includes(sign.type)
          || typeof sign.originalFileName !== "string" || !sign.originalFileName.trim()) {
          throw new Error("document_upload_unverified");
        }
        const id = sign.documentId;
        setFile(null);
        for (const inputId of ["document-file", "document-camera"]) {
          const input = document.getElementById(inputId) as HTMLInputElement | null;
          if (input) input.value = "";
        }
        setScope("ordinary");
        setStatusFilter("");
        setUnassociatedOnly(false);
        setQuery("");
        setDebouncedQuery("");
        setOffset(0);
        await loadList("/api/documents?limit=50&offset=0&scope=ordinary");
        if (metadataDirtyRef.current) {
          setPendingExit({ type: "document", id });
          setNotice("Este archivo ya existe. No se ha enviado otra copia; resuelve los cambios pendientes antes de abrirlo.");
        } else {
          selectedIdRef.current = id;
          setSelectedId(id);
          setNotice("Este archivo ya estaba guardado. Hemos abierto el original existente, sin crear una copia.");
        }
        return;
      }

      // Never send an original invoice or ticket to an arbitrary URL returned
      // by a malformed/upstream response. Upload only to the configured,
      // private Supabase Storage bucket via its signed upload endpoint.
      if (sign?.bucket !== "financial-app-documents"
        || typeof sign.path !== "string" || !/^uploads[/][0-9a-f-]+[/][0-9a-f-]+[.](?:pdf|jpg|jpeg|png|webp)$/i.test(sign.path)
        || typeof sign.signedUrl !== "string"
        || typeof sign.token !== "string" || !sign.token
        || sign.originalFileName !== file.name || sign.mimeType !== file.type
        || sign.sizeBytes !== file.size || !Number.isSafeInteger(sign.maxFileBytes)
        || sign.maxFileBytes < file.size) throw new Error("document_upload_unsafe_url");
      let uploadUrl: URL;
      try { uploadUrl = new URL(sign.signedUrl); }
      catch { throw new Error("document_upload_unsafe_url"); }
      if (uploadUrl.protocol !== "https:" || uploadUrl.origin !== SUPABASE_ORIGIN
        || uploadUrl.pathname !== `/storage/v1/object/upload/sign/financial-app-documents/${sign.path}`
        || uploadUrl.searchParams.getAll("token").length !== 1
        || uploadUrl.searchParams.get("token") !== sign.token
        || uploadUrl.username || uploadUrl.password || uploadUrl.hash) {
        throw new Error("document_upload_unsafe_url");
      }
      // Validate destination, token, requested filename, MIME and size FIRST.
      // An unsafe signer must explain its specific failure even if it also
      // lacks the new SHA-256 capability. Both gates precede any private PUT.
      if (sign.hashVerificationVersion !== 1 || sign.hashAlgorithm !== "sha256"
        || sign.contentAddressVersion !== 1) {
        throw new Error("document_upload_integrity_unsupported");
      }
      attemptedPrivateUpload = {
        action: "upload_finalize", type: uploadType, originalFileName: file.name,
        mimeType: file.type, path: sign.path, sizeBytes: file.size,
        expectedSha256, signedUrl: uploadUrl.href, file, storagePutConfirmed: false,
      };
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      // A different tab may have started while this tab awaited a signed URL.
      // Never overwrite its pending path with a second upload.
      const otherUpload = readPrivateUploadJournal();
      if (otherUpload.present) {
        unverifiedFinalizeRef.current = otherUpload.pending;
        setUploadUnverified(true);
        throw new Error("document_upload_pending");
      }
      // Durable journal before sending any byte, including across tab close.
      writePrivateUploadJournal(attemptedPrivateUpload);
      privatePutAttempted = true;
      const upload = await fetch(uploadUrl.href, { method: "PUT", headers: { "x-upsert": "false" }, body });
      // A 409 can mean another device won the same content-addressed PUT.
      // It is NOT proof of success: only a full server SHA-256 finalize can
      // confirm that the existing private object contains these same bytes.
      if (!upload.ok && upload.status !== 409) throw new Error("document_upload_unverified");
      attemptedPrivateUpload.storagePutConfirmed = upload.ok;
      writePrivateUploadJournal(attemptedPrivateUpload);
      const finalized = await readJson(await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: attemptedPrivateUpload.action, type: attemptedPrivateUpload.type,
          originalFileName: attemptedPrivateUpload.originalFileName,
          mimeType: attemptedPrivateUpload.mimeType, path: attemptedPrivateUpload.path,
          expectedSizeBytes: attemptedPrivateUpload.sizeBytes, expectedSha256: attemptedPrivateUpload.expectedSha256,
        }),
      }));
      const confirmedUpload = validatedFinalizedUpload(finalized, attemptedPrivateUpload);
      const id = confirmedUpload.document.id;
      clearPrivateUploadJournal(attemptedPrivateUpload);
      unverifiedFinalizeRef.current = null;
      setUploadUnverified(false);
      setFile(null);
      for (const inputId of ["document-file", "document-camera"]) {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (input) input.value = "";
      }
      // Reset filters before reloading so an ordinary new upload isn't
      // invisible in Pruebas, search, status or a stale pagination page.
      setScope("ordinary");
      setStatusFilter("");
      setUnassociatedOnly(false);
      setQuery("");
      setDebouncedQuery("");
      setOffset(0);
      await loadList("/api/documents?limit=50&offset=0&scope=ordinary");
      if (metadataDirtyRef.current) {
        // Uploading another file must never discard an unrelated unsaved
        // metadata draft. Let the existing save/discard dialog arbitrate.
        setPendingExit({ type: "document", id });
        setNotice(confirmedUpload.contentDuplicate
          ? "Archivo idéntico ya registrado. No hemos generado otra copia; resuelve los cambios pendientes antes de abrirlo."
          : "Original guardado. Antes de abrirlo, decide qué hacer con los metadatos pendientes del documento anterior.");
      } else {
        // selectDocument() rejects while busy === "upload": advance directly
        // after verification and let the detail effect fetch the new original.
        selectedIdRef.current = id;
        setSelectedId(id);
        setNotice(confirmedUpload.contentDuplicate
          ? "Archivo idéntico ya registrado. Hemos recuperado el original, sin sobrescribir datos ni crear otra copia."
          : "Original guardado de forma privada. Abriendo su ficha. El OCR sólo se ejecutará si lo solicitas desde su panel de revisión.");
      }
    } catch (caught) {
      if (privatePutAttempted && attemptedPrivateUpload) {
        unverifiedFinalizeRef.current = attemptedPrivateUpload;
        setUploadUnverified(true);
        setError("No se ha podido confirmar si el archivo llegó o quedó registrado. Reintenta la misma ruta privada, sin crear un envío nuevo.");
      } else {
        setError(friendlyError(caught));
      }
    } finally {
      uploadInFlight.current = false;
      setBusy(null);
    }
  }

  async function persistMetadata(): Promise<boolean> {
    if (!detail || busy) return false;
    if (!metadataDirtyRef.current) return true;
    const cents = parseEuroToCents(editor.total);
    if (cents === undefined) {
      setError("Introduce un importe válido con un máximo de dos decimales.");
      return false;
    }
    setBusy("metadata");
    setError(null);
    setAuthRecovery(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "metadata", id: detail.document.id, type: editor.type,
          documentDate: editor.documentDate || null,
          issuerName: editor.issuerName || null,
          totalCents: cents, notes: editor.notes,
        }),
      }));
      // No sustituir el editor con una relectura antigua hasta validar el PATCH.
      const confirmed = await refreshAfterMutation(detail.document.id, true);
      const persisted = confirmed?.document;
      const matchesSave = persisted?.id === detail.document.id
        && persisted.type === editor.type
        && (persisted.documentDate ?? "") === editor.documentDate
        && (persisted.issuerName ?? "") === editor.issuerName.trim()
        && persisted.totalCents === cents
        && (persisted.notes ?? "") === editor.notes.trim();
      if (!matchesSave) {
        // El PATCH pudo haberse aplicado, pero no se debe navegar ni afirmar éxito
        // hasta que el backend permita releer el documento correcto.
        setError("El guardado puede haberse realizado, pero no se pudo comprobar al recargar. Conservamos el borrador; reintenta antes de continuar.");
        return false;
      }
      setEditor(editorFromDocument(confirmed!.document));
      setDesignationOpen(false);
      setDesignationReason("");
      setDesignationReviewed(false);
      setNotice("Metadatos guardados.");
      return true;
    } catch (caught) {
      setAuthRecovery(authRecoveryFromError(caught));
      setError(friendlyError(caught));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    await persistMetadata();
  }

  async function saveAndContinue() {
    if (!pendingExit) return;
    const target = pendingExit;
    if (await persistMetadata()) continueDocumentExit(target);
  }

  function discardAndContinue() {
    if (!pendingExit) return;
    if (detail) setEditor(editorFromDocument(detail.document));
    continueDocumentExit(pendingExit);
  }

  async function changeStatus(status: DocumentStatus) {
    if (!detail) return;
    setBusy(`status-${status}`);
    setError(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", id: detail.document.id, status }),
      }));
      const confirmed = await refreshAfterMutation(detail.document.id, true);
      if (!confirmed || confirmed.document.status !== status) throw new Error("document_revalidation_incomplete");
      setNotice(`Estado cambiado a ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
  }

  async function changeTestDesignation(event: FormEvent) {
    event.preventDefault();
    if (!detail || busy || metadataDirty || !designationReviewed || !designationReason.trim()) return;
    const id = detail.document.id;
    const isTest = detail.document.isTest !== true;
    setBusy("test-designation");
    setError(null);
    setAuthRecovery(null);
    try {
      const saved = await readJson(await fetch("/api/documents", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test_designation", id, isTest, ownerReviewed: true, reason: designationReason.trim() }),
      })) as DocumentDetail;
      if (saved.contractVersion !== 3 || saved.document?.id !== id || saved.document.isTest !== isTest) {
        throw new Error("document_test_designation_incomplete");
      }
      setDetail(saved);
      setScope(isTest ? "tests" : "ordinary");
      setOffset(0);
      setDesignationOpen(false);
      setDesignationReason("");
      setDesignationReviewed(false);
      const next = new URL(listUrl, window.location.origin);
      next.searchParams.set("scope", isTest ? "tests" : "ordinary");
      next.searchParams.set("offset", "0");
      await loadList(next.toString(), true);
      setNotice(isTest ? "Documento designado como Prueba. Puedes encontrarlo en Pruebas y revertir el cambio." : "Documento devuelto a la vista ordinaria y a sus avisos correspondientes.");
    } catch (caught) {
      setAuthRecovery(authRecoveryFromError(caught));
      setError(friendlyError(caught));
    } finally { setBusy(null); }
  }

  async function openDocument() {
    if (!detail || busy || originalOpenInFlight.current) return;
    const id = detail.document.id;
    // A window opened after await fetch can be blocked by the browser.
    // Open it synchronously and only navigate after validating the signed URL.
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setError(friendlyError(new Error("document_open_blocked")));
      return;
    }
    previewWindow.opener = null;
    originalOpenInFlight.current = true;
    setBusy("open");
    setError(null);
    try {
      const result = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(id)}&mode=open`, { cache: "no-store" }));
      // Do not open an old document if the user changed selection while fetching.
      if (selectedIdRef.current !== id || previewWindow.closed) {
        if (!previewWindow.closed) previewWindow.close();
        return;
      }
      if (typeof result?.url !== "string") throw new Error("document_open_failed");
      const destination = new URL(result.url);
      if (destination.protocol !== "https:"
        && !(destination.protocol === "http:" && ["localhost", "127.0.0.1"].includes(destination.hostname))) {
        throw new Error("document_open_unsafe_url");
      }
      previewWindow.location.replace(destination.href);
      setNotice("Original abierto en otra pestaña.");
    } catch (caught) {
      if (!previewWindow.closed) previewWindow.close();
      if (selectedIdRef.current === id) setError(friendlyError(caught));
    } finally {
      originalOpenInFlight.current = false;
      setBusy(null);
    }
  }

  async function findCandidates() {
    if (!detail) return;
    setBusy("candidates");
    setError(null);
    try {
      const documentId = detail.document.id;
      const data = validatedCandidateResponse(
        await readJson(await fetch(`/api/documents?id=${encodeURIComponent(documentId)}&mode=candidates&days=7&limit=8`, { cache: "no-store" })),
        documentId,
      );
      if (selectedIdRef.current !== documentId) return;
      setCandidates(data);
      if (!data.ready) setNotice("Añade fecha e importe al documento para poder sugerir movimientos.");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
  }

  async function associate(transactionId: string, method: "manual" | "suggested") {
    if (!detail || busy || associationMutationInFlight.current || (method === "suggested" && metadataDirtyRef.current)) return;
    associationMutationInFlight.current = true;
    setBusy(`associate-${transactionId}`);
    setError(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "associate", documentId: detail.document.id, transactionId, method }),
      }));
      const confirmed = await refreshAfterMutation(detail.document.id, true);
      if (!confirmed?.associations?.some((association) => association.transactionId === transactionId)) {
        throw new Error("document_revalidation_incomplete");
      }
      setCandidates(null);
      setTransactions(null);
      setNotice(method === "suggested" ? "Sugerencia confirmada explícitamente." : "Movimiento asociado manualmente.");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { associationMutationInFlight.current = false; setBusy(null); }
  }

  async function unassociate(transactionId: string) {
    if (!detail || busy || associationMutationInFlight.current) return;
    associationMutationInFlight.current = true;
    setBusy(`unassociate-${transactionId}`);
    setError(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unassociate", documentId: detail.document.id, transactionId }),
      }));
      const confirmed = await refreshAfterMutation(detail.document.id, true);
      if (!confirmed || confirmed.associations?.some((association) => association.transactionId === transactionId)) {
        throw new Error("document_revalidation_incomplete");
      }
      setNotice("Asociación eliminada. El movimiento bancario no se ha modificado.");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { associationMutationInFlight.current = false; setBusy(null); }
  }

  async function searchTransactions(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const term = manualQuery.trim();
    const documentId = selectedIdRef.current;
    const sequence = ++manualSearchSequence.current;
    setTransactions(null);
    setTransactionResultQuery(null);
    if (!term || !documentId) return;
    setBusy("manual-search");
    setError(null);
    try {
      const data = validatedTransactionSearch(
        await readJson(await fetch(`/api/transactions?q=${encodeURIComponent(term)}&limit=20`, { cache: "no-store" })),
      );
      if (sequence !== manualSearchSequence.current || selectedIdRef.current !== documentId) return;
      setTransactions(data);
      setTransactionResultQuery(term);
    } catch (caught) {
      if (sequence === manualSearchSequence.current && selectedIdRef.current === documentId) setError(friendlyError(caught));
    } finally {
      if (sequence === manualSearchSequence.current) setBusy(null);
    }
  }

  // Los resultados solo se muestran bajo los filtros exactos que los produjeron.
  const currentList = query === debouncedQuery && loadedListKey === listUrl ? list : null;
  const listPending = query !== debouncedQuery || loadingList || (!currentList && !listLoadFailed);
  const visibleTransactions = transactionResultQuery === manualQuery.trim() ? transactions : null;

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setError(null);
    if (next && next.size > MAX_FILE_BYTES) setError("El archivo supera el máximo de 15 MB.");
  };

  return (
    <main className={styles.shell}>
      {pendingExit ? (
        <div className={styles.unsavedBackdrop}>
          <section
            className={styles.unsavedDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="document-unsaved-heading"
            aria-describedby="document-unsaved-detail"
            onKeyDown={(event) => {
              if (event.key === "Escape" && busy !== "metadata") {
                event.preventDefault();
                setPendingExit(null);
                exitReturnFocusRef.current?.focus();
              }
              if (event.key !== "Tab") return;
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (!first || !last) { event.preventDefault(); return; }
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}
          >
            <h2 id="document-unsaved-heading">Cambios sin guardar</h2>
            <p id="document-unsaved-detail">
              Hay cambios de metadatos sin guardar. Puedes guardarlos antes de continuar,
              seguir editando sin perder el borrador o descartarlos.
            </p>
            {error ? <p className={styles.unsavedError} role="alert">{error}</p> : null}
            <div className={styles.unsavedActions}>
              <button type="button" className={styles.secondaryButton} autoFocus
                onClick={() => { setPendingExit(null); exitReturnFocusRef.current?.focus(); }} disabled={busy === "metadata"}>
                Seguir editando
              </button>
              <button type="button" className={styles.primaryButton}
                onClick={() => void saveAndContinue()} disabled={busy === "metadata"}>
                {busy === "metadata" ? "Guardando…" : "Guardar y continuar"}
              </button>
              <button type="button" className={styles.dangerButton}
                onClick={discardAndContinue} disabled={busy === "metadata"}>
                Descartar cambios
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <section className={styles.hero}>
        <div>
          <Link prefetch={false} href="/" className={styles.backLink}>← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · DOCUMENTOS</p>
          <h1>Documentos</h1>
          <p className={styles.heroText}>Guarda facturas y tickets desde cámara, galería, archivos o Drive, revisa sus metadatos y relaciónalos con movimientos reales sin alterar nunca la fuente bancaria.</p>
          <a className={styles.archiveQuickLink} href="#archivo-documental">Ir al archivo documental ↓</a>
          <div className={styles.pills}>
            <span>Original privado</span><span>Cámara y galería</span><span>Asociaciones reversibles</span><span>OCR revisable · sin escrituras automáticas</span>
          </div>
        </div>
        <a className={styles.driveLink} href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">Abrir carpeta Documentos en Drive ↗</a>
      </section>

      <div className={styles.content}>
        {error ? <div className={styles.alert} role="alert" data-testid="documents-alert">{error}</div> : null}
        {authRecovery ? <DraftRecoveryNotice state={authRecovery} nextPath="/documents" /> : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        <section className={styles.uploadPanel} aria-labelledby="upload-title">
          <div>
            <p className={styles.sectionEyebrow}>IMPORTACIÓN SEGURA</p>
            <h2 id="upload-title">Añadir documento</h2>
            <p>Usa cámara, galería/archivos o Drive. PDF o imagen, hasta 15 MB. El original se almacena de forma privada y el OCR nunca se ejecuta automáticamente al subir.</p>
          </div>
          <form className={styles.uploadForm} onSubmit={uploadDocument}>
            <label>Tipo
              <select value={uploadType} onChange={(event) => setUploadType(event.target.value as DocumentType)} disabled={busy === "upload"}>
                <option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="other">Otro</option>
              </select>
            </label>
            <label className={styles.fileField}>Cámara
              <input id="document-camera" type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy !== null || uploadUnverified} />
              <span>Hacer foto con la cámara trasera</span>
            </label>
            <label className={styles.fileField}>Galería o archivo
              <input id="document-file" type="file" accept={ACCEPT} onChange={onFile} disabled={busy !== null || uploadUnverified} />
              <span>{file ? `${file.name} · ${formatBytes(file.size)}` : "PDF, JPG, PNG o WebP"}</span>
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!file || busy === "upload" || uploadUnverified}>{busy === "upload" ? "Guardando…" : "Guardar original"}</button>
            {uploadUnverified ? (
              <div role="status" data-testid="document-upload-unverified">
                <p>Subida sin confirmar. La referencia de recuperación se conserva en este navegador tras cerrar la pestaña; no selecciones ni envíes una copia nueva.</p>
                <button className={styles.secondaryButton} type="button" disabled={busy !== null}
                  onClick={() => void verifyUncertainUpload()}>
                  {busy === "upload-verify" ? "Recuperando subida…" : "Recuperar el mismo original"}
                </button>
              </div>
            ) : null}
          </form>
        </section>

        <section className={styles.workspace}>
          <aside id="archivo-documental" className={styles.listPanel} aria-label="Listado de documentos">
            <div className={styles.listHeader}>
              <div>
                <p className={styles.sectionEyebrow}>ARCHIVO DOCUMENTAL</p>
                <h2>{currentList ? `${currentList.total} documentos` : "Documentos"}</h2>
                {selectedId ? <a className={styles.detailJump} href="#documento-seleccionado">Ir a la ficha seleccionada ↓</a> : null}
              </div>
              <button className={styles.iconButton} onClick={() => void loadList()} disabled={listPending} aria-label="Actualizar documentos">↻</button>
            </div>
            <div className={styles.filters}>
              <label>Vista documental<select value={scope} onChange={(event) => { setScope(event.target.value as DocumentScope); setOffset(0); }} disabled={busy !== null}>
                <option value="ordinary">Documentos ordinarios</option><option value="tests">Pruebas</option><option value="all">Todos, incluidas pruebas</option>
              </select></label>
              <label>Buscar<input value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Nombre, emisor o notas" /></label>
              <label><span>Asociación</span><select value={unassociatedOnly ? "unassociated" : "all"} onChange={(event) => { setUnassociatedOnly(event.target.value === "unassociated"); setOffset(0); }}>
                <option value="all">Todos</option><option value="unassociated">Sin asociar</option>
              </select></label>
              <label>Estado<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setOffset(0); }}>
                <option value="">Todos</option><option value="imported">Importados</option><option value="pending_review">Pendientes</option><option value="confirmed">Confirmados</option><option value="archived">Archivados</option>
              </select></label>
            </div>
            {listPending ? <div className={styles.loading} role="status">Cargando documentos…</div> : listLoadFailed ? (
              <div className={styles.empty} role="status" data-testid="documents-list-error">
                <strong>No se ha podido cargar la lista</strong>
                <p>Estos filtros aún no se han comprobado. Los documentos no se han modificado.</p>
                <button type="button" className={styles.secondaryButton} onClick={() => void loadList()} disabled={loadingList}>Reintentar lista</button>
              </div>
            ) : currentList?.items.length ? (
              <div className={styles.documentList}>
                {currentList.items.map((item) => (
                  <button key={item.id} className={`${styles.documentRow} ${selectedId === item.id ? styles.selected : ""}`} onClick={() => selectDocument(item.id)}>
                    <span className={styles.fileIcon}>{item.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
                    <span className={styles.rowMain}><strong>{item.originalFileName}</strong><small>{TYPE_LABELS[item.type]} · {formatDate(item.documentDate)} · {item.totalCents === null ? "Sin importe" : formatMoneyCents(item.totalCents)}</small>{item.isTest === true ? <small className={styles.syntheticNoteLabel}>Prueba · designación revisada</small> : hasExplicitSyntheticDocumentNote(item.notes) ? <small className={styles.syntheticNoteLabel}>Declarado como fixture en notas · sin validar</small> : null}</span>
                    <span className={styles.rowSide}><StatusBadge status={item.status} /><small>{item.associationCount} {item.associationCount === 1 ? "asociación" : "asociaciones"}</small></span>
                  </button>
                ))}
              </div>
            ) : hasActiveListFilters ? (
              <div className={styles.empty} data-testid="documents-filtered-empty">
                <strong>No hay coincidencias</strong>
                <p>No hay documentos que coincidan con los filtros actuales.</p>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("");
                    setUnassociatedOnly(false);
                    setScope("ordinary");
                    setOffset(0);
                    window.history.replaceState(window.history.state, "", "/documents");
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : currentList?.testCount ? (
              <div className={styles.empty}>
                <strong>No hay documentos ordinarios</strong>
                <p>Los documentos designados como Prueba siguen disponibles en su vista.</p>
                <button type="button" className={styles.secondaryButton} onClick={() => { setScope("tests"); setOffset(0); }}>Ver pruebas</button>
              </div>
            ) : (
              <div className={styles.empty} data-testid="documents-repository-empty">
                <strong>No hay documentos</strong>
                <p>Añade el primero con cámara, galería/archivo o Drive; podrás analizarlo después desde su panel OCR.</p>
              </div>
            )}
            {!listLoadFailed && currentList && currentList.total > 0
              && (currentList.contractVersion === 3 || unassociatedOnly) ? (
              <nav className={styles.pagination} aria-label="Paginación documental">
                <span aria-live="polite">Mostrando {currentList.offset + 1}–{Math.min(currentList.offset + currentList.items.length, currentList.total)} de {currentList.total}</span>
                <button type="button" className={styles.secondaryButton} disabled={listPending || busy !== null || currentList.offset === 0}
                  onClick={() => setOffset(Math.max(0, currentList.offset - currentList.limit))}>Página anterior</button>
                <button type="button" className={styles.secondaryButton} disabled={listPending || busy !== null || currentList.offset + currentList.items.length >= currentList.total}
                  onClick={() => setOffset(currentList.offset + currentList.limit)}>Página siguiente</button>
              </nav>
            ) : null}
          </aside>

          <section id="documento-seleccionado" className={styles.detailPanel} aria-live="polite">
            {!selectedId ? <div className={styles.emptyDetail}><span>▤</span><h2>Selecciona un documento</h2><p>Aquí podrás revisar OCR, editar datos y asociarlo a movimientos reales.</p></div> : loadingDetail || (!detailLoadFailed && (!detail || detail.document.id !== selectedId)) ? <div className={styles.loading} role="status">Cargando detalle…</div> : !detail || detail.document.id !== selectedId ? (
              <div className={styles.emptyDetail} role="status" data-testid="documents-detail-error">
                <h2>El detalle no está disponible</h2>
                <p>Los datos de otro documento no se muestran en esta selección.</p>
                <button type="button" className={styles.secondaryButton} onClick={() => void loadDetail(selectedId)}>Reintentar detalle</button>
              </div>
            ) : (
              <>
                <header className={styles.detailHeader}>
                  <div><p className={styles.sectionEyebrow}>{TYPE_LABELS[detail.document.type].toUpperCase()}</p><h2>{detail.document.originalFileName}</h2><p>{formatBytes(detail.document.sizeBytes)} · {detail.document.storageProvider === "supabase" ? "Storage privado" : "Google Drive"}</p></div>
                  <div className={styles.detailActions}>
                    <StatusBadge status={detail.document.status} />
                    <button className={styles.secondaryButton} onClick={() => void openDocument()} disabled={busy === "open"}>Abrir documento ↗</button>
                    <a className={styles.secondaryButton} href={`/api/documents/download?id=${encodeURIComponent(detail.document.id)}`} download={detail.document.originalFileName}>Descargar original</a>
                  </div>
                </header>
                {detail.document.isTest === true ? (
                  <p className={styles.syntheticNoteNotice} role="note" data-testid="document-test-designation">
                    <strong>Prueba · designación revisada.</strong> Excluido de Alertas y Para revisar ordinarios.
                    {detail.document.testDesignationUpdatedAt ? ` Revisado el ${formatDate(detail.document.testDesignationUpdatedAt)}.` : ""}
                    {detail.document.testDesignationReason ? ` Motivo: ${detail.document.testDesignationReason}` : ""}
                  </p>
                ) : hasExplicitSyntheticDocumentNote(detail.document.notes) ? (
                  <p className={styles.syntheticNoteNotice} role="note" data-testid="document-synthetic-note">
                    Las notas guardadas describen este archivo como un fixture sintético. Comprueba su origen antes de asociarlo o analizarlo: no está designado formalmente como Prueba y sigue incluido en los avisos ordinarios. No se ha cambiado el documento ni su archivo de Drive.
                  </p>
                ) : null}

                {detail.principles?.testDesignationSupported ? (
                  <details className={styles.designationPanel} open={designationOpen} onToggle={(event) => setDesignationOpen(event.currentTarget.open)}>
                    <summary>Cambiar tratamiento documental</summary>
                    <p>{detail.document.isTest ? "Devolver este documento a la vista ordinaria restaura sus avisos cuando correspondan." : "Designar como Prueba lo separa de los avisos ordinarios y lo conserva en la vista Pruebas."} El original, los metadatos y las asociaciones se conservan.</p>
                    {!detail.principles.testDesignationEditable ? <p>El propietario del espacio debe revisar y confirmar este cambio.</p> : (
                      <form onSubmit={changeTestDesignation}>
                        {metadataDirty ? <p>Guarda o descarta los metadatos pendientes antes de cambiar el tratamiento.</p> : null}
                        <label>Motivo de la revisión<textarea value={designationReason} maxLength={500} required rows={2} onChange={(event) => setDesignationReason(event.target.value)} disabled={busy !== null || metadataDirty} /></label>
                        <label className={styles.reviewConfirmation}><input type="checkbox" checked={designationReviewed} onChange={(event) => setDesignationReviewed(event.target.checked)} disabled={busy !== null || metadataDirty} />He revisado este documento y su procedencia como propietario.</label>
                        <button className={styles.secondaryButton} type="submit" disabled={busy !== null || metadataDirty || !designationReviewed || !designationReason.trim()}>{busy === "test-designation" ? "Guardando tratamiento…" : detail.document.isTest ? "Devolver a documentos ordinarios" : "Designar como Prueba"}</button>
                        <button className={styles.secondaryButton} type="button" disabled={busy !== null} onClick={() => { setDesignationOpen(false); setDesignationReason(""); setDesignationReviewed(false); }}>Cancelar cambio</button>
                      </form>
                    )}
                  </details>
                ) : null}

                <form className={styles.editor} onSubmit={saveMetadata}>
                  {metadataDirty ? (
                    <div className={styles.notice} role="status" data-testid="document-metadata-dirty">
                      Cambios de metadatos sin guardar. Guárdalos antes de cambiar de documento o salir.
                    </div>
                  ) : null}
                  <div className={styles.formGrid}>
                    <label>Tipo<select disabled={busy !== null} value={editor.type} onChange={(event) => setEditor((value) => ({ ...value, type: event.target.value as DocumentType }))}><option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="other">Otro</option></select></label>
                    <label>Fecha<input disabled={busy !== null} type="date" value={editor.documentDate} onChange={(event) => setEditor((value) => ({ ...value, documentDate: event.target.value }))} /></label>
                    <label>Emisor<input disabled={busy !== null} value={editor.issuerName} maxLength={300} onChange={(event) => setEditor((value) => ({ ...value, issuerName: event.target.value }))} placeholder="Empresa o comercio" /></label>
                    <label>Importe (€)<input disabled={busy !== null} inputMode="decimal" value={editor.total} onChange={(event) => setEditor((value) => ({ ...value, total: event.target.value }))} placeholder="0,00" /></label>
                  </div>
                  <label>Notas<textarea disabled={busy !== null} value={editor.notes} maxLength={2000} onChange={(event) => setEditor((value) => ({ ...value, notes: event.target.value }))} rows={3} placeholder="Información útil revisada por ti" /></label>
                  <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={busy !== null || !metadataDirty}>{busy === "metadata" ? "Guardando…" : "Guardar metadatos"}</button></div>
                </form>

                <OcrReviewBoundary key={detail.document.id}>
                  <OcrReviewPanel
                    documentId={detail.document.id}
                    storageProvider={detail.document.storageProvider}
                    mimeType={detail.document.mimeType}
                    onConfirmed={() => refreshAfterOcrConfirmation(detail.document.id)}
                  />
                </OcrReviewBoundary>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Estado documental</h3><p>Los cambios son reversibles y auditables.</p></div></div>
                  <div className={styles.stateButtons}>{(["imported", "pending_review", "confirmed", "archived"] as DocumentStatus[]).map((status) => <button key={status} className={detail.document.status === status ? styles.activeState : styles.secondaryButton} onClick={() => void changeStatus(status)} disabled={busy !== null}>{STATUS_LABELS[status]}</button>)}</div>
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Movimientos asociados</h3><p>La asociación documental nunca modifica el movimiento bancario.</p></div></div>
                  {detail.associations.length ? <div className={styles.associationList}>{detail.associations.map((association) => <article key={association.id} className={styles.association}><div><strong>{association.concept}</strong><p>{formatDate(association.date)} · {association.accountName} · {formatMoneyCents(association.amountCents)}</p>{association.categoryId ? <CategoryIdentity categoryId={association.categoryId} name={null} /> : null}<small>{association.method === "suggested" ? "Sugerencia confirmada" : "Asociación manual"}</small></div><button className={styles.dangerButton} onClick={() => void unassociate(association.transactionId)} disabled={busy !== null}>Desasociar</button></article>)}</div> : <p className={styles.muted}>Este documento todavía no tiene movimientos asociados.</p>}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Sugerencias del motor financiero</h3><p>Se calculan en servidor por fecha e importe y nunca se guardan hasta que confirmes.</p></div><button className={styles.secondaryButton} onClick={() => void findCandidates()} disabled={busy !== null}>Buscar sugerencias</button></div>
                  {metadataDirty && candidates?.ready && candidates.candidates.length ? <p className={styles.muted}>Guarda los cambios del documento antes de confirmar una sugerencia calculada con sus datos anteriores.</p> : null}
                  {candidates ? (!candidates.ready ? <p className={styles.muted}>Completa fecha e importe para generar sugerencias.</p> : candidates.candidates.length ? <div className={styles.candidateList}>{candidates.candidates.map((candidate) => <article key={candidate.transactionId} className={styles.candidate}><div><strong>{candidate.concept}</strong><p>{formatDate(candidate.date)} · {candidate.accountName}</p>{candidate.categoryId ? <CategoryIdentity categoryId={candidate.categoryId} name={null} /> : null}<small>{formatMoneyCents(candidate.amountCents)} · diferencia {formatMoneyCents(candidate.amountDifferenceCents)} · {candidate.dayDifference} días</small></div><button className={styles.primaryButton} onClick={() => void associate(candidate.transactionId, "suggested")} disabled={busy !== null || metadataDirty}>Confirmar sugerencia</button></article>)}</div> : <p className={styles.muted}>No hay candidatos suficientemente próximos.</p>) : null}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Asociación manual</h3><p>Busca por concepto en los movimientos efectivos.</p></div></div>
                  <form className={styles.manualSearch} onSubmit={searchTransactions}><label>Buscar movimiento<input value={manualQuery} maxLength={200} onChange={(event) => setManualQuery(event.target.value)} placeholder="Ej. comunidad, seguro, supermercado" /></label><button className={styles.secondaryButton} type="submit" disabled={busy === "manual-search"}>Buscar</button></form>
                  {visibleTransactions ? visibleTransactions.rows.length ? <div className={styles.candidateList}>{visibleTransactions.rows.map((transaction) => <article key={transaction.id} className={styles.candidate}><div><strong>{transaction.concept.effective}</strong><p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p>{transaction.category.effectiveId ? <CategoryIdentity categoryId={transaction.category.effectiveId} name={transaction.category.effectiveName} /> : null}<small>{formatMoneyCents(transaction.amountCents)} · {transaction.kind.effective}</small></div><button className={styles.secondaryButton} onClick={() => void associate(transaction.id, "manual")} disabled={busy !== null}>Asociar</button></article>)}</div> : <p className={styles.muted}>No hay movimientos que coincidan con la búsqueda.</p> : null}
                </section>

                <div className={styles.principles}><span>✓ Fuente bancaria solo lectura</span><span>✓ Sugerencias no persistidas</span><span>✓ Confirmación explícita</span><span>✓ OCR persistente, revisable y trazable</span></div>
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
