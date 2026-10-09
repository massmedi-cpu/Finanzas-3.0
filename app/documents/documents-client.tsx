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
import styles from "./documents.module.css";

type DocumentType = "ticket" | "invoice" | "other";
type DocumentStatus = "imported" | "pending_review" | "confirmed" | "archived";
type DocumentScope = "ordinary" | "tests" | "all";
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
    throw new Error(requestErrorCode(body));
  }
  return body;
}

function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La consulta documental ha superado el tiempo de espera. No se ha modificado ningún dato; puedes reintentar.";
  }
  const code = error instanceof Error ? error.message : "request_failed";
  const labels: Record<string, string> = {
    document_owner_review_required: "El propietario debe revisar el documento antes de cambiar su tratamiento.",
    invalid_document_owner_review: "Confirma que has revisado el documento y su procedencia.",
    invalid_document_designation_reason: "Explica el motivo del cambio (hasta 500 caracteres).",
    document_test_designation_incomplete: "No se ha podido comprobar el cambio de tratamiento. Conservamos tu revisión para que puedas reintentarlo.",
    document_revalidation_incomplete: "La operación puede haberse aplicado, pero no se pudo verificar al recargar. Actualiza el documento antes de repetirla.",
    document_detail_mismatch: "El servidor no ha devuelto el documento solicitado. No mostraremos datos de otro documento; reintenta la consulta.",
    invalid_document_size: "El archivo debe ocupar entre 1 byte y 15 MB.",
    unsupported_document_mime_type: "Formato no admitido. Usa PDF, JPG, PNG o WebP.",
    invalid_document_date: "La fecha del documento no es válida.",
    invalid_document_total: "El importe del documento no es válido.",
    document_upload_not_found: "La subida no llegó a completarse en el almacenamiento privado.",
    document_upload_mime_mismatch: "El archivo subido no coincide con el tipo declarado.",
    document_suggestion_not_current: "La sugerencia ya no coincide con los datos actuales. Vuelve a buscar candidatos.",
    document_suggestion_metadata_required: "Añade fecha e importe para generar sugerencias.",
    authentication_required: "Tu sesión ha caducado antes de guardar.",
    authentication_unavailable: "El acceso seguro no está disponible temporalmente.",
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
  const [editor, setEditor] = useState<MetadataEditor>({ type: "invoice", documentDate: "", issuerName: "", total: "", notes: "" });
  const [pendingExit, setPendingExit] = useState<PendingDocumentExit | null>(null);
  const hasActiveListFilters = Boolean(query.trim() || statusFilter || unassociatedOnly || scope !== "ordinary");
  const metadataDirty = useMemo(
    () => Boolean(detail && !editorMatchesDocument(editor, detail.document)),
    [detail, editor],
  );

  const listSequence = useRef(0);
  const detailSequence = useRef(0);
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
      const first = await getDocumentJson(url) as DocumentList;
      let data = first;
      if (unassociatedOnly && first.contractVersion < 3) {
        const all = [...first.items];
        const parsed = new URL(url, window.location.origin);
        while (all.length < first.total) {
          if (all.length >= 10_000) throw new Error("document_filter_limit");
          parsed.searchParams.set("limit", "100");
          parsed.searchParams.set("offset", String(all.length));
          const next = await getDocumentJson(parsed.toString()) as DocumentList;
          if (!next.items.length) throw new Error("document_filter_incomplete");
          all.push(...next.items);
        }
        const filtered = all.filter((item) => item.status !== "archived" && item.associationCount === 0);
        data = { ...first, items: filtered, total: filtered.length, offset: 0, limit: filtered.length };
      }
      if (sequence !== listSequence.current) return;
      if (data.contractVersion === 3 && data.offset > 0 && data.items.length === 0) {
        setOffset(0);
        return;
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
    } catch (caught) {
      if (sequence === listSequence.current) {
        setListLoadFailed(true);
        setError(friendlyError(caught));
      }
    } finally {
      if (sequence === listSequence.current) setLoadingList(false);
    }
  }, [listUrl, unassociatedOnly]);

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
    }
    try {
      const data = await getDocumentJson(`/api/documents?id=${encodeURIComponent(id)}`) as DocumentDetail;
      if (sequence !== detailSequence.current || selectedIdRef.current !== id) return null;
      if (!data?.document || data.document.id !== id || !Array.isArray(data.associations)) {
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
    if (!metadataDirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassUnloadOnceRef.current || !metadataDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const protectInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
      exitReturnFocusRef.current = anchor;
      setPendingExit({ type: "navigation", href: destination.href });
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", protectInternalNavigation, true);
    };
  }, [metadataDirty]);

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
    await Promise.all([loadList(listUrl, true), loadDetail(id, true, true)]);
    setNotice("Revisión OCR confirmada y documento sincronizado.");
  }, [listUrl, loadList, loadDetail]);

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Selecciona un PDF, una imagen o haz una foto.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setError("El archivo debe ocupar entre 1 byte y 15 MB.");
      return;
    }
    setBusy("upload");
    setError(null);
    setNotice(null);
    try {
      const sign = await readJson(await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "upload_sign", type: uploadType, originalFileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      }));

      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const upload = await fetch(sign.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
      if (!upload.ok) throw new Error("document_upload_not_found");

      const finalized = await readJson(await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "upload_finalize", type: uploadType, originalFileName: file.name, mimeType: file.type, path: sign.path }),
      })) as DocumentDetail;
      const id = finalized?.document?.id;
      if (!id) throw new Error("document_upload_not_found");
      setFile(null);
      for (const inputId of ["document-file", "document-camera"]) {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (input) input.value = "";
      }
      selectDocument(id);
      await loadList();
      setNotice("Original guardado de forma privada e intacta. El OCR sólo se ejecutará si lo solicitas desde su panel de revisión.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
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
    if (!detail) return;
    setBusy("open");
    setError(null);
    try {
      const result = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(detail.document.id)}&mode=open`, { cache: "no-store" }));
      if (typeof result.url !== "string") throw new Error("document_open_failed");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
  }

  async function findCandidates() {
    if (!detail) return;
    setBusy("candidates");
    setError(null);
    try {
      const data = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(detail.document.id)}&mode=candidates&days=7&limit=8`, { cache: "no-store" })) as CandidateResponse;
      setCandidates(data);
      if (!data.ready) setNotice("Añade fecha e importe al documento para poder sugerir movimientos.");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
  }

  async function associate(transactionId: string, method: "manual" | "suggested") {
    if (!detail) return;
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
    finally { setBusy(null); }
  }

  async function unassociate(transactionId: string) {
    if (!detail) return;
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
    finally { setBusy(null); }
  }

  async function searchTransactions(event: FormEvent) {
    event.preventDefault();
    const term = manualQuery.trim();
    if (!term) {
      setTransactions(null);
      return;
    }
    setBusy("manual-search");
    setError(null);
    try {
      const data = await readJson(await fetch(`/api/transactions?q=${encodeURIComponent(term)}&limit=20`, { cache: "no-store" })) as TransactionSearch;
      setTransactions(data);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
  }

  // Los resultados solo se muestran bajo los filtros exactos que los produjeron.
  const currentList = query === debouncedQuery && loadedListKey === listUrl ? list : null;
  const listPending = query !== debouncedQuery || loadingList || (!currentList && !listLoadFailed);

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
              <input id="document-camera" type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy === "upload"} />
              <span>Hacer foto con la cámara trasera</span>
            </label>
            <label className={styles.fileField}>Galería o archivo
              <input id="document-file" type="file" accept={ACCEPT} onChange={onFile} disabled={busy === "upload"} />
              <span>{file ? `${file.name} · ${formatBytes(file.size)}` : "PDF, JPG, PNG o WebP"}</span>
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!file || busy === "upload"}>{busy === "upload" ? "Guardando…" : "Guardar original"}</button>
          </form>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.listPanel} aria-label="Listado de documentos">
            <div className={styles.listHeader}>
              <div><p className={styles.sectionEyebrow}>ARCHIVO DOCUMENTAL</p><h2>{currentList ? `${currentList.total} documentos` : "Documentos"}</h2></div>
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
            {!listLoadFailed && currentList?.contractVersion === 3 && currentList.total > 0 ? (
              <nav className={styles.pagination} aria-label="Paginación documental">
                <span aria-live="polite">Mostrando {currentList.offset + 1}–{Math.min(currentList.offset + currentList.items.length, currentList.total)} de {currentList.total}</span>
                <button type="button" className={styles.secondaryButton} disabled={listPending || busy !== null || currentList.offset === 0}
                  onClick={() => setOffset(Math.max(0, currentList.offset - currentList.limit))}>Página anterior</button>
                <button type="button" className={styles.secondaryButton} disabled={listPending || busy !== null || currentList.offset + currentList.items.length >= currentList.total}
                  onClick={() => setOffset(currentList.offset + currentList.limit)}>Página siguiente</button>
              </nav>
            ) : null}
          </aside>

          <section className={styles.detailPanel} aria-live="polite">
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
                  {candidates ? (!candidates.ready ? <p className={styles.muted}>Completa fecha e importe para generar sugerencias.</p> : candidates.candidates.length ? <div className={styles.candidateList}>{candidates.candidates.map((candidate) => <article key={candidate.transactionId} className={styles.candidate}><div><strong>{candidate.concept}</strong><p>{formatDate(candidate.date)} · {candidate.accountName}</p>{candidate.categoryId ? <CategoryIdentity categoryId={candidate.categoryId} name={null} /> : null}<small>{formatMoneyCents(candidate.amountCents)} · diferencia {formatMoneyCents(candidate.amountDifferenceCents)} · {candidate.dayDifference} días</small></div><button className={styles.primaryButton} onClick={() => void associate(candidate.transactionId, "suggested")} disabled={busy !== null}>Confirmar sugerencia</button></article>)}</div> : <p className={styles.muted}>No hay candidatos suficientemente próximos.</p>) : null}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Asociación manual</h3><p>Busca por concepto en los movimientos efectivos.</p></div></div>
                  <form className={styles.manualSearch} onSubmit={searchTransactions}><label>Buscar movimiento<input value={manualQuery} maxLength={200} onChange={(event) => setManualQuery(event.target.value)} placeholder="Ej. comunidad, seguro, supermercado" /></label><button className={styles.secondaryButton} type="submit" disabled={busy === "manual-search"}>Buscar</button></form>
                  {transactions ? transactions.rows.length ? <div className={styles.candidateList}>{transactions.rows.map((transaction) => <article key={transaction.id} className={styles.candidate}><div><strong>{transaction.concept.effective}</strong><p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p>{transaction.category.effectiveId ? <CategoryIdentity categoryId={transaction.category.effectiveId} name={transaction.category.effectiveName} /> : null}<small>{formatMoneyCents(transaction.amountCents)} · {transaction.kind.effective}</small></div><button className={styles.secondaryButton} onClick={() => void associate(transaction.id, "manual")} disabled={busy !== null}>Asociar</button></article>)}</div> : <p className={styles.muted}>No hay movimientos que coincidan con la búsqueda.</p> : null}
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
