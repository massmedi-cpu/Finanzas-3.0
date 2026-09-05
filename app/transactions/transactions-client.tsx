"use client";

import Link from "next/link";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./transactions.module.css";

type Lifecycle = "active" | "archived";
type TransactionKind = "income" | "expense" | "transfer" | "refund" | "adjustment";
type ReviewState = "confirmed" | "pending" | "needs_review";
type DuplicateState = "none" | "suspected" | "confirmed";
type ReviewMode = "duplicate" | "transfer";

type TransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  balanceAfterCents: number | null;
  account: { id: string; name: string };
  concept: { original: string; processed: string; effective: string };
  merchant: {
    originalId: string | null;
    originalName: string | null;
    effectiveId: string | null;
    effectiveName: string | null;
  };
  category: {
    originalId: string | null;
    originalName: string | null;
    effectiveId: string | null;
    effectiveName: string | null;
  };
  kind: { original: TransactionKind; effective: TransactionKind };
  reviewState: { original: ReviewState; effective: ReviewState };
  duplicateState: DuplicateState;
  transferPairId: string | null;
  excludedFromAnalytics: boolean;
  userNote: string | null;
  hasUserOverride: boolean;
  overriddenFields: string[];
  source: {
    sourceRecordId: string;
    sourceRowIdentity: string;
    sourceFileId: string;
    sourceSheetId: string | null;
    sourceRowKey: string;
    sourceFingerprint: string;
    importedAt: string;
  };
};

type DuplicateGroupRow = {
  id: string;
  account_id: string;
  account_name: string;
  bank_date: string;
  concept_normalized: string;
  amount_cents: number;
  duplicate_state: DuplicateState;
  decision: "confirmed" | "dismissed" | null;
  review_current: boolean;
};

type TransferCandidate = {
  id: string;
  account_id: string;
  account_name: string;
  bank_date: string;
  concept_normalized: string;
  amount_cents: number;
  transfer_pair_id: string | null;
  day_gap: number;
};

type Cursor = { bankDate: string; id: string };
type QueryResponse = {
  rows: TransactionRow[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: Cursor | null;
};

type Facets = {
  accounts: Array<{ id: string; name: string; lifecycle: Lifecycle; sort_order: number }>;
  categories: Array<{
    id: string;
    name: string;
    kind: string;
    lifecycle: Lifecycle;
    parent_category_id: string | null;
    sort_order: number;
  }>;
  merchants: Array<{ id: string; name: string; lifecycle: Lifecycle }>;
};

type Filters = {
  q: string;
  accountId: string;
  categoryId: string;
  merchantId: string;
  kind: string;
  reviewState: string;
  duplicateState: string;
  dateFrom: string;
  dateTo: string;
};

type EditorState = {
  concept: string;
  merchant: string;
  category: string;
  kind: string;
  reviewState: string;
  excludedFromAnalytics: boolean;
  note: string;
};

const UNCATEGORIZED = "__uncategorized__";
const INHERIT = "__inherit__";
const NONE = "__none__";
const UNCHANGED = "__unchanged__";

const EMPTY_FILTERS: Filters = {
  q: "",
  accountId: "",
  categoryId: "",
  merchantId: "",
  kind: "",
  reviewState: "",
  duplicateState: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_FACETS: Facets = { accounts: [], categories: [], merchants: [] };

const KIND_LABELS: Record<TransactionKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  refund: "Devolución",
  adjustment: "Ajuste",
};

const REVIEW_LABELS: Record<ReviewState, string> = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  needs_review: "Revisar",
};

const DUPLICATE_LABELS: Record<DuplicateState, string> = {
  none: "Sin duplicado",
  suspected: "Posible duplicado",
  confirmed: "Duplicado confirmado",
};

const OVERRIDE_LABELS: Record<string, string> = {
  concept: "concepto",
  merchant: "comercio",
  category: "categoría",
  kind: "tipo",
  reviewState: "revisión",
  excludedFromAnalytics: "analítica",
  note: "nota",
};

const moneyFormatter = new Intl.NumberFormat("es-ES", {
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

function formatMoney(cents: number | null) {
  return cents === null ? "—" : moneyFormatter.format(cents / 100);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function buildQuery(filters: Filters, cursor: Cursor | null = null) {
  const params = new URLSearchParams();
  const mapping: Array<[keyof Filters, string]> = [
    ["q", "q"],
    ["accountId", "accountId"],
    ["merchantId", "merchantId"],
    ["kind", "kind"],
    ["reviewState", "reviewState"],
    ["duplicateState", "duplicateState"],
    ["dateFrom", "dateFrom"],
    ["dateTo", "dateTo"],
  ];
  for (const [field, key] of mapping) {
    const value = filters[field].trim();
    if (value) params.set(key, value);
  }
  if (filters.categoryId === UNCATEGORIZED) params.set("uncategorized", "true");
  else if (filters.categoryId) params.set("categoryId", filters.categoryId);
  params.set("limit", "50");
  if (cursor) {
    params.set("cursorBankDate", cursor.bankDate);
    params.set("cursorId", cursor.id);
  }
  return params.toString();
}

function readableError(payload: any) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (code.includes("date_range")) return "La fecha inicial no puede ser posterior a la fecha final.";
  if (code.includes("cursor")) return "La paginación ha quedado desfasada. Actualiza el listado.";
  if (code.includes("page_limit")) return "El tamaño de página solicitado no es válido.";
  if (code.includes("transaction_not_found")) return "Algún movimiento ya no está disponible. Actualiza el listado.";
  if (code.includes("transaction_not_duplicate_candidate")) return "Este movimiento ya no forma parte de un grupo duplicado.";
  if (code.includes("category_not_found")) return "La categoría seleccionada ya no está disponible.";
  if (code.includes("merchant_not_found")) return "El comercio seleccionado ya no está disponible.";
  if (code.includes("paired_transfer_kind_locked")) return "Desempareja primero la transferencia antes de cambiar su tipo.";
  if (code.includes("transfer_kind_required")) return "Solo pueden emparejarse movimientos identificados como transferencia.";
  if (code.includes("transfer_accounts_must_differ")) return "Una transferencia interna debe conectar dos cuentas diferentes.";
  if (code.includes("transfer_amounts_must_balance")) return "Los dos movimientos deben tener importes exactamente opuestos.";
  if (code.includes("transfer_dates_too_far_apart")) return "Los movimientos están demasiado separados en el tiempo para emparejarlos.";
  if (code.includes("transaction_already_paired")) return "Uno de los movimientos ya está emparejado con otra transferencia.";
  return "No se pudo completar la operación sobre los movimientos.";
}

function editorFor(row: TransactionRow): EditorState {
  const categoryWasOverridden = row.overriddenFields.includes("category");
  const merchantWasOverridden = row.overriddenFields.includes("merchant");
  return {
    concept: row.concept.effective,
    merchant: merchantWasOverridden ? (row.merchant.effectiveId ?? NONE) : INHERIT,
    category: categoryWasOverridden ? (row.category.effectiveId ?? NONE) : INHERIT,
    kind: row.overriddenFields.includes("kind") ? row.kind.effective : INHERIT,
    reviewState: row.overriddenFields.includes("reviewState") ? row.reviewState.effective : INHERIT,
    excludedFromAnalytics: row.excludedFromAnalytics,
    note: row.userNote ?? "",
  };
}

function individualPatch(row: TransactionRow, editor: EditorState) {
  const concept = editor.concept.trim();
  const patch: Record<string, unknown> = {
    concept: concept === row.concept.processed ? null : concept,
    merchantMode: editor.merchant === INHERIT ? "inherit" : "set",
    merchantId: editor.merchant === INHERIT || editor.merchant === NONE ? null : editor.merchant,
    categoryMode: editor.category === INHERIT ? "inherit" : "set",
    categoryId: editor.category === INHERIT || editor.category === NONE ? null : editor.category,
    kind: editor.kind === INHERIT ? null : editor.kind,
    reviewState: editor.reviewState === INHERIT ? null : editor.reviewState,
    excludedFromAnalytics: editor.excludedFromAnalytics,
    note: editor.note.trim() || null,
  };
  return patch;
}

export default function TransactionsClient() {
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState(UNCHANGED);
  const [bulkReview, setBulkReview] = useState(UNCHANGED);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [duplicateGroup, setDuplicateGroup] = useState<DuplicateGroupRow[]>([]);
  const [transferCandidates, setTransferCandidates] = useState<TransferCandidate[]>([]);

  const fetchPage = useCallback(async (filters: Filters, cursor: Cursor | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/transactions?${buildQuery(filters, cursor)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(payload));
      const result = payload as QueryResponse;
      const incoming = Array.isArray(result.rows) ? result.rows : [];
      setRows((current) => append ? [...current, ...incoming] : incoming);
      setTotalCount(Number.isInteger(result.totalCount) ? result.totalCount : 0);
      setHasMore(result.hasMore === true);
      setNextCursor(result.nextCursor ?? null);
      if (!append) setSelectedIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los movimientos.");
      if (!append) {
        setRows([]);
        setTotalCount(0);
        setHasMore(false);
        setNextCursor(null);
        setSelectedIds([]);
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const response = await fetch("/api/transactions?mode=facets", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(readableError(payload));
        if (!cancelled) {
          setFacets({
            accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
            categories: Array.isArray(payload.categories) ? payload.categories : [],
            merchants: Array.isArray(payload.merchants) ? payload.merchants : [],
          });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los filtros.");
      }
    }
    void bootstrap();
    void fetchPage(EMPTY_FILTERS, null, false);
    return () => { cancelled = true; };
  }, [fetchPage]);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => value.trim() !== "").length,
    [appliedFilters],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allLoadedSelected = rows.length > 0 && rows.every((row) => selectedSet.has(row.id));

  const visibleSummary = useMemo(() => {
    if (loading) return "Leyendo movimientos…";
    if (totalCount === 0) return "0 movimientos";
    if (rows.length === totalCount) return `${totalCount.toLocaleString("es-ES")} movimientos`;
    return `${rows.length.toLocaleString("es-ES")} de ${totalCount.toLocaleString("es-ES")}`;
  }, [loading, rows.length, totalCount]);

  function updateFilter(field: keyof Filters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function closeReview() {
    setReviewingId(null);
    setReviewMode(null);
    setDuplicateGroup([]);
    setTransferCandidates([]);
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    const next = { ...draftFilters };
    setAppliedFilters(next);
    setNotice(null);
    setEditingId(null);
    setEditor(null);
    closeReview();
    void fetchPage(next, null, false);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setNotice(null);
    setEditingId(null);
    setEditor(null);
    closeReview();
    void fetchPage(EMPTY_FILTERS, null, false);
  }

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    void fetchPage(appliedFilters, nextCursor, true);
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllLoaded() {
    setSelectedIds(allLoadedSelected ? [] : rows.map((row) => row.id));
  }

  async function patchTransactions(ids: string[], patch: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionIds: ids, patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(payload));
      const changed = payload?.result?.changedTransactions;
      setNotice(Number.isInteger(changed) ? `${message} · ${changed.toLocaleString("es-ES")} modificados.` : message);
      setEditingId(null);
      setEditor(null);
      setSelectedIds([]);
      closeReview();
      await fetchPage(appliedFilters, null, false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los cambios.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openReview(row: TransactionRow, mode: ReviewMode) {
    setReviewingId(row.id);
    setReviewMode(mode);
    setReviewLoading(true);
    setDuplicateGroup([]);
    setTransferCandidates([]);
    setEditingId(null);
    setEditor(null);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams({
        mode: mode === "duplicate" ? "duplicate-group" : "transfer-candidates",
        transactionId: row.id,
      });
      if (mode === "transfer") params.set("dayWindow", "3");
      const response = await fetch(`/api/transactions?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(payload));
      const loadedRows = Array.isArray(payload.rows) ? payload.rows : [];
      if (mode === "duplicate") setDuplicateGroup(loadedRows as DuplicateGroupRow[]);
      else setTransferCandidates(loadedRows as TransferCandidate[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la revisión.");
      closeReview();
    } finally {
      setReviewLoading(false);
    }
  }

  async function runReview(command: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(payload));
      setNotice(message);
      closeReview();
      await fetchPage(appliedFilters, null, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la revisión.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(row: TransactionRow) {
    setEditingId(row.id);
    setEditor(editorFor(row));
    setNotice(null);
    closeReview();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditor(null);
  }

  async function saveEdit(row: TransactionRow) {
    if (!editor || editingId !== row.id) return;
    if (!editor.concept.trim()) {
      setError("El concepto no puede quedar vacío.");
      return;
    }
    await patchTransactions([row.id], individualPatch(row, editor), "Movimiento actualizado");
  }

  async function applyBulk() {
    if (selectedIds.length === 0) return;
    const patch: Record<string, unknown> = {};
    if (bulkCategory !== UNCHANGED) {
      if (bulkCategory === INHERIT) {
        patch.categoryMode = "inherit";
      } else {
        patch.categoryMode = "set";
        patch.categoryId = bulkCategory === NONE ? null : bulkCategory;
      }
    }
    if (bulkReview !== UNCHANGED) {
      patch.reviewState = bulkReview === INHERIT ? null : bulkReview;
    }
    if (Object.keys(patch).length === 0) {
      setError("Selecciona al menos un cambio para aplicar en bloque.");
      return;
    }
    const ok = await patchTransactions(selectedIds, patch, "Edición masiva completada");
    if (ok) {
      setBulkCategory(UNCHANGED);
      setBulkReview(UNCHANGED);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/">← Financial App</Link>
          <p className={styles.eyebrow}>FASE 4 · MOVIMIENTOS</p>
          <h1>Movimientos</h1>
          <p>
            Consulta y gestiona el histórico persistido sin alterar el origen bancario. Cada cambio manual se
            guarda como override separado y conserva la trazabilidad hasta la fila original.
          </p>
        </div>
        <div className={styles.summary} aria-label="Resumen del listado">
          <div><strong>{totalCount.toLocaleString("es-ES")}</strong><span>Coincidencias</span></div>
          <div><strong>{activeFilterCount}</strong><span>Filtros activos</span></div>
          <div><strong>{selectedIds.length.toLocaleString("es-ES")}</strong><span>Seleccionados</span></div>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters} aria-label="Filtros de movimientos">
        <label className={styles.searchField}>
          <span>Buscar</span>
          <input value={draftFilters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Concepto, comercio, categoría o cuenta" />
        </label>
        <label>
          <span>Cuenta</span>
          <select value={draftFilters.accountId} onChange={(event) => updateFilter("accountId", event.target.value)}>
            <option value="">Todas</option>
            {facets.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.lifecycle === "archived" ? " · archivada" : ""}</option>)}
          </select>
        </label>
        <label>
          <span>Categoría</span>
          <select data-testid="category-filter" value={draftFilters.categoryId} onChange={(event) => updateFilter("categoryId", event.target.value)}>
            <option value="">Todas</option>
            <option value={UNCATEGORIZED}>Sin categoría</option>
            {facets.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.lifecycle === "archived" ? " · archivada" : ""}</option>)}
          </select>
        </label>
        <label>
          <span>Comercio</span>
          <select value={draftFilters.merchantId} onChange={(event) => updateFilter("merchantId", event.target.value)}>
            <option value="">Todos</option>
            {facets.merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}{merchant.lifecycle === "archived" ? " · archivado" : ""}</option>)}
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select value={draftFilters.kind} onChange={(event) => updateFilter("kind", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Revisión</span>
          <select value={draftFilters.reviewState} onChange={(event) => updateFilter("reviewState", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Duplicados</span>
          <select value={draftFilters.duplicateState} onChange={(event) => updateFilter("duplicateState", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(DUPLICATE_LABELS) as Array<[DuplicateState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><span>Desde</span><input type="date" value={draftFilters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={draftFilters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit" disabled={loading || saving}>Aplicar filtros</button>
          <button className={styles.secondaryButton} type="button" onClick={clearFilters} disabled={loading || saving}>Limpiar</button>
        </div>
      </form>

      {selectedIds.length > 0 && (
        <section className={styles.bulkBar} aria-label="Edición masiva de movimientos">
          <div className={styles.bulkIntro}><strong>{selectedIds.length.toLocaleString("es-ES")} seleccionados</strong><span>Los cambios se guardan como overrides; el origen bancario permanece intacto.</span></div>
          <label><span>Categoría</span><select data-testid="bulk-category" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option><option value={NONE}>Sin categoría</option>
            {facets.categories.filter((category) => category.lifecycle === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label><span>Revisión</span><select data-testid="bulk-review" value={bulkReview} onChange={(event) => setBulkReview(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option>
            {(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button data-testid="bulk-apply" className={styles.primaryButton} type="button" onClick={() => void applyBulk()} disabled={saving}>Aplicar cambios</button>
        </section>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.panel} aria-labelledby="transaction-list-heading">
        <div className={styles.panelHeading}>
          <div><p className={styles.kicker}>HISTÓRICO EFECTIVO</p><h2 id="transaction-list-heading">Listado</h2></div>
          <div className={styles.headingActions}>
            <button className={styles.secondaryButton} type="button" onClick={toggleAllLoaded} disabled={rows.length === 0 || loading || saving}>{allLoadedSelected ? "Deseleccionar cargados" : "Seleccionar cargados"}</button>
            <span className={styles.resultCount}>{visibleSummary}</span>
          </div>
        </div>

        {loading ? <div className={styles.loading} role="status">Leyendo movimientos persistidos…</div> : rows.length === 0 ? <div className={styles.empty}>No hay movimientos que coincidan con los filtros actuales.</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th className={styles.selectHeading}>Sel.</th><th>Fecha</th><th>Concepto y trazabilidad</th><th>Cuenta</th><th>Categoría</th><th>Estado</th><th className={styles.amountHeading}>Importe</th><th>Gestión</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={selectedSet.has(row.id) ? styles.selectedRow : undefined}>
                      <td data-label="Seleccionar" className={styles.selectCell}><input data-testid={`select-${row.id}`} aria-label={`Seleccionar ${row.concept.effective}`} type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggleRow(row.id)} /></td>
                      <td data-label="Fecha"><time dateTime={row.bankDate}>{formatDate(row.bankDate)}</time></td>
                      <td data-label="Concepto" className={styles.conceptCell}>
                        <div className={styles.conceptTop}><strong>{row.concept.effective}</strong>{row.hasUserOverride && <span className={styles.overrideChip}>Modificado</span>}{row.excludedFromAnalytics && <span className={styles.mutedChip}>Fuera de analítica</span>}</div>
                        <p>{row.merchant.effectiveName ?? "Sin comercio"}</p>
                        <details className={styles.trace}><summary>Detalle y trazabilidad</summary><dl>
                          <div><dt>Concepto original</dt><dd>{row.concept.original}</dd></div><div><dt>Concepto procesado</dt><dd>{row.concept.processed}</dd></div><div><dt>Concepto efectivo</dt><dd>{row.concept.effective}</dd></div>
                          <div><dt>Comercio original</dt><dd>{row.merchant.originalName ?? "—"}</dd></div><div><dt>Comercio efectivo</dt><dd>{row.merchant.effectiveName ?? "—"}</dd></div>
                          <div><dt>Categoría original</dt><dd>{row.category.originalName ?? "—"}</dd></div><div><dt>Categoría efectiva</dt><dd>{row.category.effectiveName ?? "—"}</dd></div>
                          <div><dt>Tipo original / efectivo</dt><dd>{KIND_LABELS[row.kind.original]} / {KIND_LABELS[row.kind.effective]}</dd></div><div><dt>Saldo tras movimiento</dt><dd>{formatMoney(row.balanceAfterCents)}</dd></div>
                          <div><dt>Fila de origen</dt><dd>{row.source.sourceRowKey}</dd></div><div><dt>Hoja de origen</dt><dd>{row.source.sourceSheetId ?? "—"}</dd></div><div><dt>Registro fuente</dt><dd>{row.source.sourceRecordId}</dd></div><div><dt>Identidad fuente</dt><dd>{row.source.sourceRowIdentity}</dd></div><div><dt>Fingerprint</dt><dd>{row.source.sourceFingerprint}</dd></div>
                          {row.transferPairId && <div><dt>Transferencia emparejada</dt><dd>{row.transferPairId}</dd></div>}
                          {row.overriddenFields.length > 0 && <div><dt>Campos modificados</dt><dd>{row.overriddenFields.map((field) => OVERRIDE_LABELS[field] ?? field).join(", ")}</dd></div>}{row.userNote && <div><dt>Nota</dt><dd>{row.userNote}</dd></div>}
                        </dl></details>
                      </td>
                      <td data-label="Cuenta">{row.account.name}</td>
                      <td data-label="Categoría">{row.category.effectiveName ?? <span className={styles.muted}>Sin categoría</span>}</td>
                      <td data-label="Estado"><div className={styles.statusStack}><span className={`${styles.stateChip} ${styles[row.reviewState.effective]}`}>{REVIEW_LABELS[row.reviewState.effective]}</span>{row.duplicateState !== "none" && <span className={styles.duplicateChip}>{DUPLICATE_LABELS[row.duplicateState]}</span>}{row.transferPairId && <span className={styles.transferChip}>Transferencia emparejada</span>}</div></td>
                      <td data-label="Importe" className={`${styles.amount} ${row.amountCents >= 0 ? styles.positive : styles.negative}`}>{formatMoney(row.amountCents)}</td>
                      <td data-label="Gestión"><div className={styles.rowActions}>
                        <button data-testid={`edit-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => beginEdit(row)} disabled={saving}>Editar</button>
                        {row.duplicateState !== "none" && <button data-testid={`review-duplicate-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => void openReview(row, "duplicate")} disabled={saving || reviewLoading}>Duplicado</button>}
                        {row.kind.effective === "transfer" && <button data-testid={`review-transfer-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => void openReview(row, "transfer")} disabled={saving || reviewLoading}>{row.transferPairId ? "Ver pareja" : "Emparejar"}</button>}
                      </div></td>
                    </tr>
                    {editingId === row.id && editor && (
                      <tr className={styles.editorRow}><td colSpan={8}>
                        <section className={styles.editor} aria-label={`Editar ${row.concept.effective}`}>
                          <div className={styles.editorHeading}><div><strong>Editar movimiento</strong><span>Solo se modifica la capa personal de overrides.</span></div><button className={styles.secondaryButton} type="button" onClick={cancelEdit} disabled={saving}>Cancelar</button></div>
                          <div className={styles.editorGrid}>
                            <label className={styles.editorWide}><span>Concepto</span><input data-testid="edit-concept" value={editor.concept} maxLength={240} onChange={(event) => setEditor({ ...editor, concept: event.target.value })} /></label>
                            <label><span>Comercio</span><select value={editor.merchant} onChange={(event) => setEditor({ ...editor, merchant: event.target.value })}><option value={INHERIT}>Automático/original</option><option value={NONE}>Sin comercio</option>{facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>
                            <label><span>Categoría</span><select data-testid="edit-category" value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })}><option value={INHERIT}>Automática/original</option><option value={NONE}>Sin categoría</option>{facets.categories.filter((category) => category.lifecycle === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                            <label><span>Tipo</span><select value={editor.kind} disabled={Boolean(row.transferPairId)} onChange={(event) => setEditor({ ...editor, kind: event.target.value })}><option value={INHERIT}>Automático/original</option>{(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{row.transferPairId && <small>Desempareja la transferencia antes de cambiar su tipo.</small>}</label>
                            <label><span>Revisión</span><select data-testid="edit-review" value={editor.reviewState} onChange={(event) => setEditor({ ...editor, reviewState: event.target.value })}><option value={INHERIT}>Automática/original</option>{(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label className={styles.editorWide}><span>Nota</span><textarea value={editor.note} maxLength={2000} rows={3} onChange={(event) => setEditor({ ...editor, note: event.target.value })} /></label>
                            <label className={styles.checkboxLabel}><input type="checkbox" checked={editor.excludedFromAnalytics} onChange={(event) => setEditor({ ...editor, excludedFromAnalytics: event.target.checked })} /><span>Excluir de analítica</span></label>
                          </div>
                          <div className={styles.editorActions}><button data-testid="save-edit" className={styles.primaryButton} type="button" onClick={() => void saveEdit(row)} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
                        </section>
                      </td></tr>
                    )}
                    {reviewingId === row.id && reviewMode && (
                      <tr className={styles.reviewRow}><td colSpan={8}>
                        <section className={styles.reviewPanel} aria-label={reviewMode === "duplicate" ? `Revisar duplicado ${row.concept.effective}` : `Revisar transferencia ${row.concept.effective}`}>
                          <div className={styles.editorHeading}>
                            <div><strong>{reviewMode === "duplicate" ? "Revisión de duplicado" : "Emparejado de transferencia interna"}</strong><span>{reviewMode === "duplicate" ? "La decisión queda vinculada a la revisión bancaria actual y nunca borra la fuente." : "Solo se proponen cuentas distintas, importes opuestos exactos y fechas dentro de 3 días."}</span></div>
                            <button className={styles.secondaryButton} type="button" onClick={closeReview} disabled={saving}>Cerrar</button>
                          </div>
                          {reviewLoading ? <div className={styles.loading} role="status">Comprobando candidatos…</div> : reviewMode === "duplicate" ? (
                            <>
                              <div className={styles.reviewList} data-testid="duplicate-group">
                                {duplicateGroup.map((candidate) => <div className={styles.reviewCard} key={candidate.id}>
                                  <div><strong>{candidate.id === row.id ? "Movimiento actual" : candidate.account_name}</strong><span>{formatDate(candidate.bank_date)} · {candidate.concept_normalized}</span></div>
                                  <strong className={candidate.amount_cents >= 0 ? styles.positive : styles.negative}>{formatMoney(candidate.amount_cents)}</strong>
                                  <span>{DUPLICATE_LABELS[candidate.duplicate_state]}</span>
                                </div>)}
                              </div>
                              <div className={styles.reviewActions}>
                                <button data-testid="duplicate-confirm" className={styles.primaryButton} type="button" onClick={() => void runReview({ action: "duplicate-review", transactionId: row.id, decision: "confirmed" }, "Duplicado confirmado y auditado.")} disabled={saving || duplicateGroup.length < 2}>Confirmar duplicado</button>
                                <button data-testid="duplicate-dismiss" className={styles.secondaryButton} type="button" onClick={() => void runReview({ action: "duplicate-review", transactionId: row.id, decision: "dismissed" }, "Aviso de duplicado descartado para esta revisión bancaria.")} disabled={saving || duplicateGroup.length < 2}>No es duplicado</button>
                              </div>
                            </>
                          ) : (
                            <>
                              {row.transferPairId ? <div className={styles.reviewNotice}>Este movimiento ya está emparejado. Puedes revisar la contraparte o deshacer el vínculo sin alterar ninguno de los movimientos bancarios.</div> : null}
                              <div className={styles.reviewList} data-testid="transfer-candidates">
                                {transferCandidates.length === 0 ? <div className={styles.empty}>No hay una contraparte válida dentro de la ventana de 3 días.</div> : transferCandidates.map((candidate) => <div className={styles.reviewCard} key={candidate.id}>
                                  <div><strong>{candidate.account_name}</strong><span>{formatDate(candidate.bank_date)} · {candidate.concept_normalized}</span></div>
                                  <strong className={candidate.amount_cents >= 0 ? styles.positive : styles.negative}>{formatMoney(candidate.amount_cents)}</strong>
                                  <span>{candidate.day_gap === 0 ? "Mismo día" : candidate.day_gap === 1 ? "1 día" : `${candidate.day_gap} días`}</span>
                                  {!row.transferPairId && <button data-testid={`transfer-pair-${candidate.id}`} className={styles.primaryButton} type="button" onClick={() => void runReview({ action: "transfer-pair", transactionId: row.id, pairId: candidate.id }, "Transferencia interna emparejada y auditada.")} disabled={saving}>Emparejar</button>}
                                </div>)}
                              </div>
                              {row.transferPairId && <div className={styles.reviewActions}><button data-testid="transfer-unpair" className={styles.secondaryButton} type="button" onClick={() => void runReview({ action: "transfer-unpair", transactionId: row.id }, "Transferencia desemparejada y auditada.")} disabled={saving}>Desemparejar</button></div>}
                            </>
                          )}
                        </section>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && <div className={styles.pagination}><span>{visibleSummary}</span>{hasMore && <button type="button" onClick={loadMore} disabled={loadingMore || !nextCursor || saving}>{loadingMore ? "Cargando…" : "Cargar 50 más"}</button>}</div>}
      </section>
    </main>
  );
}
