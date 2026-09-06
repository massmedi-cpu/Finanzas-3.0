"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./documents.module.css";

type DocumentType = "ticket" | "invoice" | "other";
type DocumentStatus = "imported" | "pending_review" | "confirmed" | "archived";
type StorageProvider = "supabase" | "google_drive";

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
  contractVersion: 1;
  document: Omit<DocumentItem, "associationCount"> & { storageKey?: string };
  associations: Association[];
  principles: DocumentPrinciples;
};

type DocumentPrinciples = {
  bankSource: "read_only";
  ocrEnabled: false;
  getHasSideEffects: false;
  suggestionsPersisted: false;
  associationsRequireConfirmation: true;
};

type DocumentList = {
  contractVersion: 1;
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
  category: { effectiveName: string | null };
  kind: { effective: string };
};

type TransactionSearch = {
  rows: TransactionRow[];
  totalCount: number;
};

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1UCUZSmOWfGM5VyvhDcx7ExeBw3LS872t";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
  return dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatBytes(value: number | null) {
  if (value === null) return "Tamaño no disponible";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`;
}

function euroInput(cents: number | null) {
  if (cents === null) return "";
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

function parseEuroToCents(input: string) {
  const compact = input.trim().replace(/\s/g, "");
  if (!compact) return null;
  let normalized: string;
  if (compact.includes(",")) normalized = compact.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(compact)) normalized = compact;
  else normalized = compact.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [units, decimals = ""] = normalized.split(".");
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : typeof body?.error === "string" ? body.error : "request_failed";
    throw new Error(code);
  }
  return body;
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : "request_failed";
  const labels: Record<string, string> = {
    invalid_document_size: "El archivo debe ocupar entre 1 byte y 15 MB.",
    unsupported_document_mime_type: "Formato no admitido. Usa PDF, JPG, PNG o WebP.",
    invalid_document_date: "La fecha del documento no es válida.",
    invalid_document_total: "El importe del documento no es válido.",
    document_upload_not_found: "La subida no llegó a completarse en el almacenamiento privado.",
    document_upload_mime_mismatch: "El archivo subido no coincide con el tipo declarado.",
    document_suggestion_not_current: "La sugerencia ya no coincide con los datos actuales. Vuelve a buscar candidatos.",
    document_suggestion_metadata_required: "Añade fecha e importe para generar sugerencias.",
    authentication_required: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  };
  return labels[code] ?? "No se pudo completar la operación documental.";
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`${styles.status} ${styles[`status_${status}`]}`}>{STATUS_LABELS[status]}</span>;
}

export function DocumentsClient() {
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
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<DocumentType>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [editor, setEditor] = useState({ type: "invoice" as DocumentType, documentDate: "", issuerName: "", total: "", notes: "" });

  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
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
      setEditor({
        type: data.document.type,
        documentDate: data.document.documentDate ?? "",
        issuerName: data.document.issuerName ?? "",
        total: euroInput(data.document.totalCents),
        notes: data.document.notes ?? "",
      });
    } catch (caught) {
      if (sequence === detailSequence.current) setError(friendlyError(caught));
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  const selectDocument = (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  };

  const refreshAfterMutation = useCallback(async (id: string) => {
    await Promise.all([loadList(), loadDetail(id)]);
  }, [loadList, loadDetail]);

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Selecciona primero un PDF o una imagen.");
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
      const input = document.getElementById("document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      selectDocument(id);
      await loadList();
      setNotice("Documento guardado de forma privada. OCR no se ha ejecutado.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const cents = parseEuroToCents(editor.total);
    if (cents === undefined) {
      setError("Introduce un importe válido con un máximo de dos decimales.");
      return;
    }
    setBusy("metadata");
    setError(null);
    try {
      await readJson(await fetch("/api/documents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "metadata", id: detail.document.id, type: editor.type, documentDate: editor.documentDate || null, issuerName: editor.issuerName || null, totalCents: cents, notes: editor.notes }),
      }));
      await refreshAfterMutation(detail.document.id);
      setNotice("Metadatos guardados.");
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(null); }
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

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setError(null);
    if (next && next.size > MAX_FILE_BYTES) setError("El archivo supera el máximo de 15 MB.");
  };

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <Link href="/" className={styles.backLink}>← Inicio</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · FASE 9</p>
          <h1>Documentos</h1>
          <p className={styles.heroText}>Guarda facturas y tickets, revisa sus metadatos y relaciónalos con movimientos reales sin alterar nunca la fuente bancaria.</p>
          <div className={styles.pills}>
            <span>Storage privado</span><span>Asociaciones reversibles</span><span>OCR desactivado · F11</span>
          </div>
        </div>
        <a className={styles.driveLink} href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">Abrir carpeta Documentos en Drive ↗</a>
      </section>

      <div className={styles.content}>
        {error ? <div className={styles.alert} role="alert" data-testid="documents-alert">{error}</div> : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        <section className={styles.uploadPanel} aria-labelledby="upload-title">
          <div>
            <p className={styles.sectionEyebrow}>IMPORTACIÓN SEGURA</p>
            <h2 id="upload-title">Añadir documento</h2>
            <p>PDF o imagen, hasta 15 MB. Se almacena de forma privada y no se ejecuta OCR en esta fase.</p>
          </div>
          <form className={styles.uploadForm} onSubmit={uploadDocument}>
            <label>Tipo
              <select value={uploadType} onChange={(event) => setUploadType(event.target.value as DocumentType)} disabled={busy === "upload"}>
                <option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="other">Otro</option>
              </select>
            </label>
            <label className={styles.fileField}>Archivo
              <input id="document-file" type="file" accept={ACCEPT} onChange={onFile} disabled={busy === "upload"} />
              <span>{file ? `${file.name} · ${formatBytes(file.size)}` : "Selecciona PDF, JPG, PNG o WebP"}</span>
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!file || busy === "upload"}>{busy === "upload" ? "Guardando…" : "Guardar documento"}</button>
          </form>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.listPanel} aria-label="Listado de documentos">
            <div className={styles.listHeader}>
              <div><p className={styles.sectionEyebrow}>ARCHIVO DOCUMENTAL</p><h2>{list?.total ?? 0} documentos</h2></div>
              <button className={styles.iconButton} onClick={() => void loadList()} disabled={loadingList} aria-label="Actualizar documentos">↻</button>
            </div>
            <div className={styles.filters}>
              <label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, emisor o notas" /></label>
              <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos</option><option value="imported">Importados</option><option value="pending_review">Pendientes</option><option value="confirmed">Confirmados</option><option value="archived">Archivados</option>
              </select></label>
            </div>
            {loadingList ? <div className={styles.loading}>Cargando documentos…</div> : list?.items.length ? (
              <div className={styles.documentList}>
                {list.items.map((item) => (
                  <button key={item.id} className={`${styles.documentRow} ${selectedId === item.id ? styles.selected : ""}`} onClick={() => selectDocument(item.id)}>
                    <span className={styles.fileIcon}>{item.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
                    <span className={styles.rowMain}><strong>{item.originalFileName}</strong><small>{TYPE_LABELS[item.type]} · {formatDate(item.documentDate)} · {item.totalCents === null ? "Sin importe" : money.format(item.totalCents / 100)}</small></span>
                    <span className={styles.rowSide}><StatusBadge status={item.status} /><small>{item.associationCount} {item.associationCount === 1 ? "asociación" : "asociaciones"}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className={styles.empty}><strong>No hay documentos</strong><p>Sube el primero arriba. La carga no activa OCR.</p></div>}
          </aside>

          <section className={styles.detailPanel} aria-live="polite">
            {!selectedId ? <div className={styles.emptyDetail}><span>▤</span><h2>Selecciona un documento</h2><p>Aquí podrás editar sus datos y asociarlo a movimientos reales.</p></div> : loadingDetail || !detail ? <div className={styles.loading}>Cargando detalle…</div> : (
              <>
                <header className={styles.detailHeader}>
                  <div><p className={styles.sectionEyebrow}>{TYPE_LABELS[detail.document.type].toUpperCase()}</p><h2>{detail.document.originalFileName}</h2><p>{formatBytes(detail.document.sizeBytes)} · {detail.document.storageProvider === "supabase" ? "Storage privado" : "Google Drive"}</p></div>
                  <div className={styles.detailActions}><StatusBadge status={detail.document.status} /><button className={styles.secondaryButton} onClick={() => void openDocument()} disabled={busy === "open"}>Abrir documento ↗</button></div>
                </header>

                <form className={styles.editor} onSubmit={saveMetadata}>
                  <div className={styles.formGrid}>
                    <label>Tipo<select value={editor.type} onChange={(event) => setEditor((value) => ({ ...value, type: event.target.value as DocumentType }))}><option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="other">Otro</option></select></label>
                    <label>Fecha<input type="date" value={editor.documentDate} onChange={(event) => setEditor((value) => ({ ...value, documentDate: event.target.value }))} /></label>
                    <label>Emisor<input value={editor.issuerName} onChange={(event) => setEditor((value) => ({ ...value, issuerName: event.target.value }))} placeholder="Empresa o comercio" /></label>
                    <label>Importe (€)<input inputMode="decimal" value={editor.total} onChange={(event) => setEditor((value) => ({ ...value, total: event.target.value }))} placeholder="0,00" /></label>
                  </div>
                  <label>Notas<textarea value={editor.notes} onChange={(event) => setEditor((value) => ({ ...value, notes: event.target.value }))} rows={3} placeholder="Información útil sin OCR" /></label>
                  <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={busy === "metadata"}>{busy === "metadata" ? "Guardando…" : "Guardar metadatos"}</button></div>
                </form>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Estado documental</h3><p>Los cambios son reversibles y auditables.</p></div></div>
                  <div className={styles.stateButtons}>{(["imported", "pending_review", "confirmed", "archived"] as DocumentStatus[]).map((status) => <button key={status} className={detail.document.status === status ? styles.activeState : styles.secondaryButton} onClick={() => void changeStatus(status)} disabled={busy !== null}>{STATUS_LABELS[status]}</button>)}</div>
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Movimientos asociados</h3><p>La asociación documental nunca modifica el movimiento bancario.</p></div></div>
                  {detail.associations.length ? <div className={styles.associationList}>{detail.associations.map((association) => <article key={association.id} className={styles.association}><div><strong>{association.concept}</strong><p>{formatDate(association.date)} · {association.accountName} · {money.format(association.amountCents / 100)}</p><small>{association.method === "suggested" ? "Sugerencia confirmada" : "Asociación manual"}</small></div><button className={styles.dangerButton} onClick={() => void unassociate(association.transactionId)} disabled={busy !== null}>Desasociar</button></article>)}</div> : <p className={styles.muted}>Este documento todavía no tiene movimientos asociados.</p>}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Sugerencias del motor financiero</h3><p>Se calculan en servidor por fecha e importe y nunca se guardan hasta que confirmes.</p></div><button className={styles.secondaryButton} onClick={() => void findCandidates()} disabled={busy !== null}>Buscar sugerencias</button></div>
                  {candidates ? (!candidates.ready ? <p className={styles.muted}>Completa fecha e importe para generar sugerencias.</p> : candidates.candidates.length ? <div className={styles.candidateList}>{candidates.candidates.map((candidate) => <article key={candidate.transactionId} className={styles.candidate}><div><strong>{candidate.concept}</strong><p>{formatDate(candidate.date)} · {candidate.accountName}</p><small>{money.format(candidate.amountCents / 100)} · diferencia {money.format(candidate.amountDifferenceCents / 100)} · {candidate.dayDifference} días</small></div><button className={styles.primaryButton} onClick={() => void associate(candidate.transactionId, "suggested")} disabled={busy !== null}>Confirmar sugerencia</button></article>)}</div> : <p className={styles.muted}>No hay candidatos suficientemente próximos.</p>) : null}
                </section>

                <section className={styles.subsection}>
                  <div className={styles.subsectionHeading}><div><h3>Asociación manual</h3><p>Busca por concepto en los movimientos efectivos.</p></div></div>
                  <form className={styles.manualSearch} onSubmit={searchTransactions}><label>Buscar movimiento<input value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} placeholder="Ej. comunidad, seguro, supermercado" /></label><button className={styles.secondaryButton} type="submit" disabled={busy === "manual-search"}>Buscar</button></form>
                  {transactions ? transactions.rows.length ? <div className={styles.candidateList}>{transactions.rows.map((transaction) => <article key={transaction.id} className={styles.candidate}><div><strong>{transaction.concept.effective}</strong><p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p><small>{money.format(transaction.amountCents / 100)} · {transaction.kind.effective}</small></div><button className={styles.secondaryButton} onClick={() => void associate(transaction.id, "manual")} disabled={busy !== null}>Asociar</button></article>)}</div> : <p className={styles.muted}>No hay movimientos que coincidan con la búsqueda.</p> : null}
                </section>

                <div className={styles.principles}><span>✓ Fuente bancaria solo lectura</span><span>✓ Sugerencias no persistidas</span><span>✓ Confirmación explícita</span><span>✓ OCR desactivado hasta F11</span></div>
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
