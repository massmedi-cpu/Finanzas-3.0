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
import type { DocumentOcrInterpretation } from "../../src/domain/document-ocr-interpretation";
import { useActionFeedback } from "../action-feedback";
import { DraftRecoveryNotice } from "../draft-recovery-notice";
import { CategoryIdentity } from "../category-identity";
import { OcrReviewBoundary } from "./ocr-review-boundary";
import { OcrReviewPanel } from "./ocr-review-panel";
import styles from "./documents.module.css";

type DocumentType = "ticket" | "invoice" | "other";
type DocumentStatus = "imported" | "pending_review" | "confirmed" | "archived";
type StorageProvider = "supabase" | "google_drive";
type OcrStatus = "not_processed" | "ready" | "needs_review" | "empty" | "failed";

type DocumentLineItem = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
};

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
  issuerTaxId: string | null;
  documentNumber: string | null;
  totalCents: number | null;
  paymentMethod: string | null;
  documentDate: string | null;
  ocrStatus: OcrStatus;
  ocrExtractedAt: string | null;
  storageProvider: StorageProvider;
  associationCount: number;
  originalFileName: string;
  sourceModifiedAt: string | null;
  sourceDriveFileId: string | null;
};

type DocumentRecord = Omit<DocumentItem, "associationCount"> & {
  storageKey?: string;
  documentTime: string | null;
  documentPeriod: string | null;
  baseCents: number | null;
  taxCents: number | null;
  lineItems: DocumentLineItem[];
  ocrRecognition: unknown | null;
  ocrInterpretation: DocumentOcrInterpretation | null;
};

type Association = {
  id: string;
  date: string;
  method: "manual" | "suggested" | "automatic";
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
  confidence: number | null;
};

type DocumentPrinciples = {
  bankSource: "read_only";
  ocrEnabled: true;
  financialWrites: false;
  getHasSideEffects: false;
  suggestionsPersisted: false;
  associationsRequireConfirmation: true;
  recognitionSeparatedFromInterpretation?: true;
  userReviewSeparatedFromOcr?: true;
  originalMovementImmutable?: true;
};

type DocumentDetail = {
  contractVersion: 2;
  document: DocumentRecord;
  associations: Association[];
  principles: DocumentPrinciples;
};

type DocumentList = {
  contractVersion: 2;
  items: DocumentItem[];
  total: number;
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

type EditorState = {
  type: DocumentType;
  documentDate: string;
  documentTime: string;
  issuerName: string;
  issuerTaxId: string;
  documentNumber: string;
  documentPeriod: string;
  base: string;
  tax: string;
  total: string;
  paymentMethod: string;
  lineItems: DocumentLineItem[];
  notes: string;
};

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1UCUZSmOWfGM5VyvhDcx7ExeBw3LS872t";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
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

const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  not_processed: "OCR pendiente",
  ready: "OCR listo",
  needs_review: "OCR dudoso",
  empty: "OCR sin texto",
  failed: "OCR fallido",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatBytes(value: number | null) {
  if (value === null) return "Tamaño no disponible";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${formatNumberWithDigits(value / 1024, 1, 0)} KB`;
  return `${formatNumberWithDigits(value / 1024 / 1024, 1, 0)} MB`;
}

function euroInput(cents: number | null) {
  if (cents === null) return "";
  return formatMoneyInputCents(cents);
}

function parseEuroToCents(input: string) {
  if (!input.trim()) return null;
  try {
    return parseMoneyInputToCents(input);
  } catch {
    return undefined;
  }
}

function emptyEditor(): EditorState {
  return {
    type: "invoice",
    documentDate: "",
    documentTime: "",
    issuerName: "",
    issuerTaxId: "",
    documentNumber: "",
    documentPeriod: "",
    base: "",
    tax: "",
    total: "",
    paymentMethod: "",
    lineItems: [],
    notes: "",
  };
}

function editorFromDocument(document: DocumentRecord): EditorState {
  return {
    type: document.type,
    documentDate: document.documentDate ?? "",
    documentTime: document.documentTime?.slice(0, 8) ?? "",
    issuerName: document.issuerName ?? "",
    issuerTaxId: document.issuerTaxId ?? "",
    documentNumber: document.documentNumber ?? "",
    documentPeriod: document.documentPeriod ?? "",
    base: euroInput(document.baseCents),
    tax: euroInput(document.taxCents),
    total: euroInput(document.totalCents),
    paymentMethod: document.paymentMethod ?? "",
    lineItems: Array.isArray(document.lineItems) ? document.lineItems : [],
    notes: document.notes ?? "",
  };
}

function reviewedLinesFromOcr(interpretation: DocumentOcrInterpretation): DocumentLineItem[] {
  return interpretation.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    totalCents: line.totalCents,
  }));
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(requestErrorCode(body));
  return body;
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : "request_failed";
  const labels: Record<string, string> = {
    invalid_document_size: "El archivo debe ocupar entre 1 byte y 15 MB.",
    unsupported_document_mime_type: "Formato no admitido. Usa PDF, JPG, PNG o WebP.",
    invalid_document_date: "La fecha del documento no es válida.",
    invalid_document_time: "La hora del documento no es válida.",
    invalid_document_base: "La base imponible no es válida.",
    invalid_document_tax: "Los impuestos no son válidos.",
    invalid_document_total: "El importe total no es válido.",
    invalid_document_line_items: "Las líneas revisadas del documento no son válidas.",
    document_upload_not_found: "La subida no llegó a completarse en el almacenamiento privado.",
    document_upload_mime_mismatch: "El archivo subido no coincide con el tipo declarado.",
    document_download_failed: "No se ha podido descargar temporalmente el original.",
    document_suggestion_not_current: "La sugerencia ya no coincide con los datos actuales. Vuelve a buscar candidatos.",
    document_suggestion_metadata_required: "Añade fecha e importe para generar sugerencias.",
    authentication_required: "Tu sesión ha caducado antes de guardar.",
    authentication_unavailable: "El acceso seguro no está disponible temporalmente.",
  };
  return labels[code] ?? "No se pudo completar la operación documental.";
}

function documentActionPendingLabel(action: string) {
  if (action === "upload") return "Guardando documento de forma privada…";
  if (action === "metadata") return "Guardando datos revisados…";
  if (action === "ocr-apply") return "Recuperando la última interpretación OCR…";
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
  if (action === "metadata") return "Datos revisados guardados y auditados.";
  if (action === "ocr-apply") return "Propuesta OCR cargada en el formulario. Todavía no se ha guardado.";
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

export function DocumentsClient() {
  const actionFeedback = useActionFeedback();
  const [list, setList] = useState<DocumentList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [candidates, setCandidates] = useState<CandidateResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionSearch | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRecovery, setAuthRecovery] = useState<AuthRecoveryState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<DocumentType>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const feedbackActionRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    return `/api/documents?${params}`;
  }, [query, statusFilter]);

  const loadList = useCallback(async (url = listUrl) => {
    const sequence = ++listSequence.current;
    setLoadingList(true);
    setError(null);
    try {
      const data = await readJson(await fetch(url, { cache: "no-store" })) as DocumentList;
      if (sequence !== listSequence.current) return;
      setList(data);
      if (selectedIdRef.current && !data.items.some((item) => item.id === selectedIdRef.current)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (caught) {
      if (sequence === listSequence.current) setError(friendlyError(caught));
    } finally {
      if (sequence === listSequence.current) setLoadingList(false);
    }
  }, [listUrl]);

  const loadDetail = useCallback(async (id: string) => {
    const sequence = ++detailSequence.current;
    setLoadingDetail(true);
    setError(null);
    setCandidates(null);
    setTransactions(null);
    try {
      const data = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { cache: "no-store" })) as DocumentDetail;
      if (sequence !== detailSequence.current || selectedIdRef.current !== id) return;
      setDetail(data);
      setEditor(editorFromDocument(data.document));
    } catch (caught) {
      if (sequence === detailSequence.current) setError(friendlyError(caught));
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
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

  const selectDocument = (id: string) => {
    setAuthRecovery(null);
    selectedIdRef.current = id;
    setSelectedId(id);
  };

  const refreshAfterMutation = useCallback(async (id: string) => {
    await Promise.all([loadList(), loadDetail(id)]);
  }, [loadList, loadDetail]);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setError(null);
    if (next && next.size > MAX_FILE_BYTES) setError("El archivo supera el máximo de 15 MB.");
  };

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
      setNotice("Original guardado de forma privada e intacta. El OCR se ejecuta sólo cuando lo solicitas.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const baseCents = parseEuroToCents(editor.base);
    const taxCents = parseEuroToCents(editor.tax);
    const totalCents = parseEuroToCents(editor.total);
    if (baseCents === undefined || taxCents === undefined || totalCents === undefined) {
      setError("Revisa base, impuestos y total. Usa importes válidos con un máximo de dos decimales.");
      return;
    }
    setBusy("metadata");
    setError(null);
    setAuthRecovery(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "metadata",
          id: detail.document.id,
          type: editor.type,
          documentDate: editor.documentDate || null,
          documentTime: editor.documentTime || null,
          issuerName: editor.issuerName || null,
          issuerTaxId: editor.issuerTaxId || null,
          documentNumber: editor.documentNumber || null,
          documentPeriod: editor.documentPeriod || null,
          baseCents,
          taxCents,
          totalCents,
          paymentMethod: editor.paymentMethod || null,
          lineItems: editor.lineItems,
          notes: editor.notes,
        }),
      }));
      await refreshAfterMutation(detail.document.id);
      setNotice("Datos revisados guardados. La lectura OCR original se conserva por separado para trazabilidad.");
    } catch (caught) {
      setAuthRecovery(authRecoveryFromError(caught));
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function applyLatestOcr() {
    if (!detail) return;
    setBusy("ocr-apply");
    setError(null);
    try {
      const fresh = await readJson(await fetch(`/api/documents?id=${encodeURIComponent(detail.document.id)}`, { cache: "no-store" })) as DocumentDetail;
      const ocr = fresh.document.ocrInterpretation;
      setDetail(fresh);
      if (!ocr) {
        setNotice("Todavía no hay una interpretación OCR guardada. Ejecuta primero «Analizar documento».");
        return;
      }
      setEditor((current) => ({
        ...current,
        documentDate: current.documentDate || ocr.documentDate.value || "",
        documentTime: current.documentTime || ocr.documentTime.value || "",
        issuerName: current.issuerName || ocr.issuerName.value || "",
        issuerTaxId: current.issuerTaxId || ocr.taxId.value || "",
        documentNumber: current.documentNumber || ocr.documentNumber.value || "",
        documentPeriod: current.documentPeriod || ocr.period.value || "",
        base: current.base || euroInput(ocr.baseCents.value),
        tax: current.tax || euroInput(ocr.taxCents.value),
        total: current.total || euroInput(ocr.totalCents.value),
        paymentMethod: current.paymentMethod || ocr.paymentMethod.value || "",
        lineItems: current.lineItems.length ? current.lineItems : reviewedLinesFromOcr(ocr),
      }));
      setNotice("Propuesta OCR cargada sólo en los campos vacíos. Revisa y pulsa «Guardar datos revisados» cuando estés conforme.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  }

  function updateLineItem(index: number, patch: Partial<DocumentLineItem>) {
    setEditor((current) => ({
      ...current,
      lineItems: current.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  }

  function removeLineItem(index: number) {
    setEditor((current) => ({ ...current, lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index) }));
  }

  function addLineItem() {
    setEditor((current) => ({ ...current, lineItems: [...current.lineItems, { description: "", quantity: null, unitPriceCents: null, totalCents: null }] }));
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
      await refreshAfterMutation(detail.document.id);
      setNotice(`Estado cambiado a ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
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
      await refreshAfterMutation(detail.document.id);
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
      await refreshAfterMutation(detail.document.id);
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

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <Link prefetch={false} href="/" className={styles.backLink}>← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · DOCUMENTOS</p>
          <h1>Documentos</h1>
          <p className={styles.heroText}>Guarda facturas y tickets, revisa el OCR y relaciónalos con movimientos reales sin alterar nunca la fuente bancaria.</p>
          <div className={styles.pills}>
            <span>Original privado</span><span>OCR trazable</span><span>Revisión humana</span><span>Asociaciones reversibles</span>
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
            <p>Usa cámara, galería/archivos o Drive. El original se conserva intacto y el OCR nunca se ejecuta automáticamente al subir.</p>
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
              <div><p className={styles.sectionEyebrow}>ARCHIVO DOCUMENTAL</p><h2>{list?.total ?? 0} documentos</h2></div>
              <button className={styles.iconButton} onClick={() => void loadList()} disabled={loadingList} aria-label="Actualizar documentos">↻</button>
            </div>
            <div className={styles.filters}>
              <label>Buscar<input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, emisor, CIF/NIF o número" /></label>
              <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos</option><option value="imported">Importados</option><option value="pending_review">Pendientes</option><option value="confirmed">Confirmados</option><option value="archived">Archivados</option>
              </select></label>
            </div>
            {loadingList ? <div className={styles.loading}>Cargando documentos…</div> : list?.items.length ? (
              <div className={styles.documentList}>
                {list.items.map((item) => (
                  <button key={item.id} className={`${styles.documentRow} ${selectedId === item.id ? styles.selected : ""}`} onClick={() => selectDocument(item.id)}>
                    <span className={styles.fileIcon}>{item.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
                    <span className={styles.rowMain}><strong>{item.originalFileName}</strong><small>{TYPE_LABELS[item.type]} · {formatDate(item.documentDate)} · {item.totalCents === null ? "Sin importe" : formatMoneyCents(item.totalCents)}</small><small>{OCR_STATUS_LABELS[item.ocrStatus]}</small></span>
                    <span className={styles.rowSide}><StatusBadge status={item.status} /><small>{item.associationCount} {item.associationCount === 1 ? "asociación" : "asociaciones"}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className={styles.empty}><strong>No hay documentos</strong><p>Añade el primero con cámara, galería/archivo o Drive.</p></div>}
          </aside>

          <section className={styles.detailPanel} aria-live="polite">
            {!selectedId ? <div className={styles.emptyDetail}><span>▤</span><h2>Selecciona un documento</h2><p>Aquí podrás revisar OCR, editar datos y asociarlo a movimientos reales.</p></div> : loadingDetail || !detail ? <div className={styles.loading}>Cargando detalle…</div> : (
              <>
                <header className={styles.detailHeader}>
                  <div><p className={styles.sectionEyebrow}>{TYPE_LABELS[detail.document.type].toUpperCase()}</p><h2>{detail.document.originalFileName}</h2><p>{formatBytes(detail.document.sizeBytes)} · {detail.document.storageProvider === "supabase" ? "Storage privado" : "Google Drive"} · {OCR_STATUS_LABELS[detail.document.ocrStatus]}</p></div>
                  <div className={styles.detailActions}>
                    <StatusBadge status={detail.document.status} />
                    <button className={styles.secondaryButton} onClick={() => void openDocument()} disabled={busy === "open"}>Abrir ↗</button>
                    <a className={styles.secondaryButton} href={`/api/documents?id=${encodeURIComponent(detail.document.id)}&mode=download`}>Descargar</a>
                  </div>
                </header>

                <form className={styles.editor} onSubmit={saveMetadata}>
                  <div className={styles.subsectionHeading}>
                    <div><h3>Datos revisados</h3><p>Estos campos son tu versión confirmada. El OCR bruto e interpretado se conservan aparte.</p></div>
                    <button className={styles.secondaryButton} type="button" onClick={() => void applyLatestOcr()} disabled={busy !== null}>Usar última propuesta OCR</button>
                  </div>
                  <div className={styles.formGrid}>
                    <label>Tipo<select value={editor.type} onChange={(event) => setEditor((value) => ({ ...value, type: event.target.value as DocumentType }))}><option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="other">Otro</option></select></label>
                    <label>Fecha<input type="date" value={editor.documentDate} onChange={(event) => setEditor((value) => ({ ...value, documentDate: event.target.value }))} /></label>
                    <label>Hora<input type="time" step="1" value={editor.documentTime} onChange={(event) => setEditor((value) => ({ ...value, documentTime: event.target.value }))} /></label>
                    <label>Emisor<input value={editor.issuerName} maxLength={300} onChange={(event) => setEditor((value) => ({ ...value, issuerName: event.target.value }))} placeholder="Empresa o comercio" /></label>
                    <label>CIF/NIF<input value={editor.issuerTaxId} maxLength={40} onChange={(event) => setEditor((value) => ({ ...value, issuerTaxId: event.target.value }))} placeholder="B12345678" /></label>
                    <label>Número<input value={editor.documentNumber} maxLength={100} onChange={(event) => setEditor((value) => ({ ...value, documentNumber: event.target.value }))} placeholder="Número de ticket o factura" /></label>
                    <label>Periodo<input value={editor.documentPeriod} maxLength={100} onChange={(event) => setEditor((value) => ({ ...value, documentPeriod: event.target.value }))} placeholder="Ej. 09/2026" /></label>
                    <label>Base (€)<input inputMode="decimal" value={editor.base} onChange={(event) => setEditor((value) => ({ ...value, base: event.target.value }))} placeholder="0,00" /></label>
                    <label>Impuestos (€)<input inputMode="decimal" value={editor.tax} onChange={(event) => setEditor((value) => ({ ...value, tax: event.target.value }))} placeholder="0,00" /></label>
                    <label>Total (€)<input inputMode="decimal" value={editor.total} onChange={(event) => setEditor((value) => ({ ...value, total: event.target.value }))} placeholder="0,00" /></label>
                    <label>Método de pago<input value={editor.paymentMethod} maxLength={100} onChange={(event) => setEditor((value) => ({ ...value, paymentMethod: event.target.value }))} placeholder="Tarjeta, efectivo…" /></label>
                  </div>

                  <div className={styles.subsection}>
                    <div className={styles.subsectionHeading}><div><h3>Líneas revisadas</h3><p>Puedes corregir, añadir o retirar líneas sin modificar la evidencia OCR guardada.</p></div><button className={styles.secondaryButton} type="button" onClick={addLineItem}>Añadir línea</button></div>
                    {editor.lineItems.length ? <div className={styles.candidateList}>{editor.lineItems.map((line, index) => (
                      <article className={styles.candidate} key={`${index}-${line.description}`}>
                        <div className={styles.formGrid}>
                          <label>Descripción<input value={line.description} maxLength={300} onChange={(event) => updateLineItem(index, { description: event.target.value })} /></label>
                          <label>Cantidad<input inputMode="numeric" value={line.quantity ?? ""} onChange={(event) => updateLineItem(index, { quantity: event.target.value ? Math.max(1, Math.trunc(Number(event.target.value))) : null })} /></label>
                          <label>Precio unitario (€)<input inputMode="decimal" value={euroInput(line.unitPriceCents)} onChange={(event) => { const value = parseEuroToCents(event.target.value); if (value !== undefined) updateLineItem(index, { unitPriceCents: value }); }} /></label>
                          <label>Total línea (€)<input inputMode="decimal" value={euroInput(line.totalCents)} onChange={(event) => { const value = parseEuroToCents(event.target.value); if (value !== undefined) updateLineItem(index, { totalCents: value }); }} /></label>
                        </div>
                        <button className={styles.dangerButton} type="button" onClick={() => removeLineItem(index)}>Quitar línea</button>
                      </article>
                    ))}</div> : <p className={styles.muted}>No hay líneas revisadas. Puedes cargar la propuesta OCR o añadirlas manualmente.</p>}
                  </div>

                  <label>Notas<textarea value={editor.notes} maxLength={2000} onChange={(event) => setEditor((value) => ({ ...value, notes: event.target.value }))} rows={3} placeholder="Información útil revisada por ti" /></label>
                  <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={busy === "metadata"}>{busy === "metadata" ? "Guardando…" : "Guardar datos revisados"}</button></div>
                </form>

                <OcrReviewBoundary key={detail.document.id}><OcrReviewPanel documentId={detail.document.id} storageProvider={detail.document.storageProvider} mimeType={detail.document.mimeType} /></OcrReviewBoundary>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Estado documental</h3><p>Los cambios son reversibles y auditables.</p></div></div>
                  <div className={styles.stateButtons}>{(["imported", "pending_review", "confirmed", "archived"] as DocumentStatus[]).map((status) => <button key={status} className={detail.document.status === status ? styles.activeState : styles.secondaryButton} onClick={() => void changeStatus(status)} disabled={busy !== null}>{STATUS_LABELS[status]}</button>)}</div>
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Movimientos asociados</h3><p>La asociación documental nunca modifica el movimiento bancario.</p></div></div>
                  {detail.associations.length ? <div className={styles.associationList}>{detail.associations.map((association) => <article key={association.id} className={styles.association}><div><strong>{association.concept}</strong><p>{formatDate(association.date)} · {association.accountName} · {formatMoneyCents(association.amountCents)}</p>{association.categoryId ? <CategoryIdentity categoryId={association.categoryId} name={null} /> : null}<small>{association.method === "suggested" ? "Sugerencia confirmada" : association.method === "automatic" ? "Asociación automática segura" : "Asociación manual"}{association.confidence !== null ? ` · ${formatNumberWithDigits(association.confidence * 100, 0)} %` : ""}</small></div><button className={styles.dangerButton} onClick={() => void unassociate(association.transactionId)} disabled={busy !== null}>Desasociar</button></article>)}</div> : <p className={styles.muted}>Este documento todavía no tiene movimientos asociados.</p>}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Sugerencias del motor financiero</h3><p>Se calculan en servidor por fecha e importe y nunca se guardan hasta que confirmes.</p></div><button className={styles.secondaryButton} onClick={() => void findCandidates()} disabled={busy !== null}>Buscar sugerencias</button></div>
                  {candidates ? (!candidates.ready ? <p className={styles.muted}>Completa fecha e importe para generar sugerencias.</p> : candidates.candidates.length ? <div className={styles.candidateList}>{candidates.candidates.map((candidate) => <article key={candidate.transactionId} className={styles.candidate}><div><strong>{candidate.concept}</strong><p>{formatDate(candidate.date)} · {candidate.accountName}</p>{candidate.categoryId ? <CategoryIdentity categoryId={candidate.categoryId} name={null} /> : null}<small>{formatMoneyCents(candidate.amountCents)} · diferencia {formatMoneyCents(candidate.amountDifferenceCents)} · {candidate.dayDifference} días · {formatNumberWithDigits(candidate.confidence * 100, 0)} % coincidencia</small></div><button className={styles.primaryButton} onClick={() => void associate(candidate.transactionId, "suggested")} disabled={busy !== null}>Confirmar sugerencia</button></article>)}</div> : <p className={styles.muted}>No hay candidatos suficientemente próximos.</p>) : null}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Asociación manual</h3><p>Busca por concepto en los movimientos efectivos.</p></div></div>
                  <form className={styles.manualSearch} onSubmit={searchTransactions}><label>Buscar movimiento<input value={manualQuery} maxLength={200} onChange={(event) => setManualQuery(event.target.value)} placeholder="Ej. comunidad, seguro, supermercado" /></label><button className={styles.secondaryButton} type="submit" disabled={busy === "manual-search"}>Buscar</button></form>
                  {transactions ? transactions.rows.length ? <div className={styles.candidateList}>{transactions.rows.map((transaction) => <article key={transaction.id} className={styles.candidate}><div><strong>{transaction.concept.effective}</strong><p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p>{transaction.category.effectiveId ? <CategoryIdentity categoryId={transaction.category.effectiveId} name={transaction.category.effectiveName} /> : null}<small>{formatMoneyCents(transaction.amountCents)} · {transaction.kind.effective}</small></div><button className={styles.secondaryButton} onClick={() => void associate(transaction.id, "manual")} disabled={busy !== null}>Asociar</button></article>)}</div> : <p className={styles.muted}>No hay movimientos que coincidan con la búsqueda.</p> : null}
                </section>

                <div className={styles.principles}><span>✓ Original intacto</span><span>✓ OCR derivado separado</span><span>✓ Correcciones auditadas</span><span>✓ Fuente bancaria solo lectura</span><span>✓ Sugerencias no persistidas</span><span>✓ Confirmación explícita</span></div>
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
