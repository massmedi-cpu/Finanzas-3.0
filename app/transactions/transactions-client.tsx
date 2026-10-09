"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MAX_TRANSACTION_PATCH_SIZE } from "../../src/core/transaction-limits";
import { buildBulkTransactionPatch, type BulkReviewState } from "../../src/application/transaction-bulk-edit";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatInteger } from "../../src/core/formatters";
import { formatMoneyCents } from "../../src/core/money";
import {
  authRecoveryFromCode,
  requestErrorCode,
  type AuthRecoveryState,
} from "../../src/application/auth-recovery";
import { DraftRecoveryNotice } from "../draft-recovery-notice";
import { CategoryIdentity } from "../category-identity";
import { TransactionSplitEditor, type TransactionSplitSummary } from "./transaction-split-editor";
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
  signMismatch: boolean;
  transferPairId: string | null;
  excludedFromAnalytics: boolean;
  userNote: string | null;
  tags: string[];
  hasUserOverride: boolean;
  overriddenFields: string[];
  split: TransactionSplitSummary;
  source: {
    sourceRecordId: string;
    sourceRowIdentity: string;
    sourceFileId: string;
    sourceSheetId: string | null;
    sourceRowKey: string;
    sourceFingerprint: string;
    importedAt: string;
    channel: string | null;
    counterparty: string | null;
    reconciliation: string | null;
    sourceSubcategory: string | null;
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
  channels: string[];
  reconciliationStates: string[];
  years: number[];
  tags: string[];
};

type Filters = {
  q: string;
  accountId: string;
  categoryId: string;
  merchantId: string;
  kind: string;
  reviewState: string;
  duplicateState: string;
  signMismatch: string;
  channel: string;
  counterparty: string;
  reconciliation: string;
  recurring: string;
  internalTransfer: string;
  hasDocument: string;
  documentQuery: string;
  splitLabel: string;
  tag: string;
  ocrQuery: string;
  year: string;
  month: string;
  amountFrom: string;
  amountTo: string;
  dateFrom: string;
  dateTo: string;
};

type CategoryEditorMode = "inherit" | "set";

type EditorState = {
  concept: string;
  merchantMode: "inherit" | "set";
  merchant: string;
  categoryMode: CategoryEditorMode;
  categoryRoot: string;
  categoryLeaf: string;
  kindMode: "inherit" | "set";
  kind: string;
  excludedFromAnalytics: boolean;
  note: string;
  tagsText: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_FILTER = /^-?\d+(?:[.,]\d{1,2})?$/;

const UNCATEGORIZED = "__uncategorized__";
const INHERIT = "__inherit__";
const NONE = "__none__";
const UNCHANGED = "__unchanged__";
const ANALYTICS_INCLUDE = "__include__";
const ANALYTICS_EXCLUDE = "__exclude__";
const CONCEPT_ERROR_ID = "transaction-concept-error";
const SUBCATEGORY_ERROR_ID = "transaction-subcategory-error";
const TAGS_ERROR_ID = "transaction-tags-error";

const EMPTY_FILTERS: Filters = {
  q: "",
  accountId: "",
  categoryId: "",
  merchantId: "",
  kind: "",
  reviewState: "",
  duplicateState: "",
  signMismatch: "",
  channel: "",
  counterparty: "",
  reconciliation: "",
  recurring: "",
  internalTransfer: "",
  hasDocument: "",
  documentQuery: "",
  splitLabel: "",
  tag: "",
  ocrQuery: "",
  year: "",
  month: "",
  amountFrom: "",
  amountTo: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_FACETS: Facets = { accounts: [], categories: [], merchants: [], channels: [], reconciliationStates: [], years: [], tags: [] };

const KIND_LABELS: Record<TransactionKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  refund: "Devolución",
  adjustment: "Ajuste",
};

const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  needs_review: "Por revisar",
};

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

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
  excludedFromAnalytics: "analítica",
  note: "nota",
  split: "reparto",
  tags: "etiquetas",
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formatMoney(cents: number | null) {
  return cents === null ? "—" : formatMoneyCents(cents);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function moneyFilterToCents(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!MONEY_FILTER.test(raw)) return Number.NaN;
  const normalized = raw.replace(",", ".");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  const signed = negative ? -cents : cents;
  return Number.isSafeInteger(signed) ? signed : Number.NaN;
}

function centsParamToMoneyFilter(value: string | null) {
  if (!value || !/^-?\d+$/.test(value)) return "";
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
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
    ["signMismatch", "signMismatch"],
    ["channel", "channel"],
    ["counterparty", "counterparty"],
    ["reconciliation", "reconciliation"],
    ["recurring", "recurring"],
    ["internalTransfer", "internalTransfer"],
    ["hasDocument", "hasDocument"],
    ["documentQuery", "documentQuery"],
    ["splitLabel", "splitLabel"],
    ["tag", "tag"],
    ["ocrQuery", "ocrQuery"],
    ["year", "year"],
    ["month", "month"],
    ["dateFrom", "dateFrom"],
    ["dateTo", "dateTo"],
  ];
  for (const [field, key] of mapping) {
    const value = filters[field].trim();
    if (value) params.set(key, value);
  }
  if (filters.categoryId === UNCATEGORIZED) params.set("uncategorized", "true");
  else if (filters.categoryId) params.set("categoryId", filters.categoryId);

  const amountFromCents = moneyFilterToCents(filters.amountFrom);
  const amountToCents = moneyFilterToCents(filters.amountTo);
  if (amountFromCents !== null && Number.isSafeInteger(amountFromCents)) params.set("amountFromCents", String(amountFromCents));
  if (amountToCents !== null && Number.isSafeInteger(amountToCents)) params.set("amountToCents", String(amountToCents));

  params.set("limit", "50");
  if (cursor) {
    params.set("cursorBankDate", cursor.bankDate);
    params.set("cursorId", cursor.id);
  }
  return params.toString();
}

function readableError(payload: any) {
  const code = requestErrorCode(payload);
  if (code === "authentication_required") return "Tu sesión ha caducado antes de guardar.";
  if (code === "authentication_unavailable") return "El acceso seguro no está disponible temporalmente.";
  if (code.includes("date_range")) return "La fecha inicial no puede ser posterior a la fecha final.";
  if (code.includes("amount_range")) return "El importe mínimo no puede ser superior al importe máximo.";
  if (code.includes("cursor")) return "La paginación ha quedado desfasada. Actualiza el listado.";
  if (code.includes("page_limit")) return "El tamaño de página solicitado no es válido.";
  if (code.includes("transaction_not_found")) return "Algún movimiento ya no está disponible. Actualiza el listado.";
  if (code.includes("transaction_not_duplicate_candidate")) return "Este movimiento ya no forma parte de un grupo duplicado.";
  if (code.includes("category_not_found")) return "La categoría seleccionada ya no está disponible.";
  if (code.includes("merchant_not_found")) return "El comercio seleccionado ya no está disponible.";
  if (code.includes("transaction_tags_single_edit_only")) return "Las etiquetas generales se editan desde un movimiento individual.";
  if (code.includes("too_many_transaction_tags") || code.includes("invalid_transaction_tags")) return "Puedes guardar hasta 12 etiquetas por movimiento.";
  if (code.includes("invalid_transaction_tag")) return "Cada etiqueta debe tener entre 1 y 40 caracteres.";
  if (code.includes("paired_transfer_kind_locked")) return "Desempareja primero la transferencia antes de cambiar su tipo.";
  if (code.includes("transfer_kind_required")) return "Solo pueden emparejarse movimientos identificados como transferencia.";
  if (code.includes("transfer_accounts_must_differ")) return "Una transferencia interna debe conectar dos cuentas diferentes.";
  if (code.includes("transfer_amounts_must_balance")) return "Los dos movimientos deben tener importes exactamente opuestos.";
  if (code.includes("transfer_dates_too_far_apart")) return "Los movimientos están demasiado separados en el tiempo para emparejarlos.";
  if (code.includes("transaction_already_paired")) return "Uno de los movimientos ya está emparejado con otra transferencia.";
  return "No se pudo completar la operación sobre los movimientos.";
}

function categorySelectionFor(categories: Facets["categories"], categoryId: string | null) {
  if (!categoryId) return { root: NONE, leaf: "" };
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category) return { root: NONE, leaf: "" };
  return category.parent_category_id
    ? { root: category.parent_category_id, leaf: category.id }
    : { root: category.id, leaf: "" };
}

function activeSubcategories(categories: Facets["categories"], rootId: string) {
  if (!rootId || rootId === NONE) return [];
  return categories
    .filter((category) => category.lifecycle === "active" && category.parent_category_id === rootId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es"));
}

function selectedCategoryId(editor: EditorState, categories: Facets["categories"]) {
  if (editor.categoryRoot === NONE) return null;
  const children = activeSubcategories(categories, editor.categoryRoot);
  return children.length > 0 ? (editor.categoryLeaf || null) : editor.categoryRoot;
}

function editorFor(row: TransactionRow, categories: Facets["categories"]): EditorState {
  const categoryWasOverridden = row.overriddenFields.includes("category");
  const merchantWasOverridden = row.overriddenFields.includes("merchant");
  const selection = categorySelectionFor(categories, row.category.effectiveId);
  return {
    concept: row.concept.effective,
    merchantMode: merchantWasOverridden ? "set" : "inherit",
    merchant: row.merchant.effectiveId ?? NONE,
    categoryMode: categoryWasOverridden ? "set" : "inherit",
    categoryRoot: selection.root,
    categoryLeaf: selection.leaf,
    kindMode: row.overriddenFields.includes("kind") ? "set" : "inherit",
    kind: row.kind.effective,
    excludedFromAnalytics: row.excludedFromAnalytics,
    note: row.userNote ?? "",
    tagsText: Array.isArray(row.tags) ? row.tags.join(", ") : "",
  };
}

function normalizedTagsFromEditor(value: string) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > 40) return { tags: [] as string[], error: `La etiqueta «${tag.slice(0, 24)}…» supera los 40 caracteres.` };
    const key = tag.toLocaleLowerCase("es");
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  if (tags.length > 12) return { tags: [] as string[], error: "Puedes guardar hasta 12 etiquetas por movimiento." };
  return { tags: tags.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), error: "" };
}

function individualPatch(row: TransactionRow, editor: EditorState, categories: Facets["categories"], tags: string[]) {
  const concept = editor.concept.trim();
  return {
    concept: concept === row.concept.processed ? null : concept,
    merchantMode: editor.merchantMode,
    merchantId: editor.merchantMode === "inherit" || editor.merchant === NONE ? null : editor.merchant,
    categoryMode: editor.categoryMode,
    categoryId: editor.categoryMode === "inherit" ? null : selectedCategoryId(editor, categories),
    kind: editor.kindMode === "inherit" ? null : editor.kind,
    excludedFromAnalytics: editor.excludedFromAnalytics,
    note: editor.note.trim() || null,
    tags,
  } satisfies Record<string, unknown>;
}

export default function TransactionsClient() {
  const searchParams = useSearchParams();
  const filterSearch = searchParams.toString();
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRecovery, setAuthRecovery] = useState<AuthRecoveryState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState(UNCHANGED);
  const [bulkMerchant, setBulkMerchant] = useState(UNCHANGED);
  const [bulkReviewState, setBulkReviewState] = useState(UNCHANGED);
  const [bulkAnalytics, setBulkAnalytics] = useState(UNCHANGED);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [conceptError, setConceptError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [tagsError, setTagsError] = useState("");
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [duplicateGroup, setDuplicateGroup] = useState<DuplicateGroupRow[]>([]);
  const [transferCandidates, setTransferCandidates] = useState<TransferCandidate[]>([]);
  const replaceRequestSequence = useRef(0);
  const appendRequestSequence = useRef(0);
  const replaceAbortController = useRef<AbortController | null>(null);
  const appendAbortController = useRef<AbortController | null>(null);
  const conceptInputRef = useRef<HTMLInputElement>(null);
  const subcategorySelectRef = useRef<HTMLSelectElement>(null);
  const pendingFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (!editingId) return;
    const frame = window.requestAnimationFrame(() => conceptInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);

  const fetchPage = useCallback(async (filters: Filters, cursor: Cursor | null, append: boolean) => {
    if (append && replaceAbortController.current) return;

    const replaceEpochAtStart = replaceRequestSequence.current;
    const requestSequence = append
      ? ++appendRequestSequence.current
      : ++replaceRequestSequence.current;
    const controller = new AbortController();

    if (append) {
      appendAbortController.current?.abort();
      appendAbortController.current = controller;
      setLoadingMore(true);
    } else {
      replaceAbortController.current?.abort();
      appendAbortController.current?.abort();
      appendRequestSequence.current += 1;
      replaceAbortController.current = controller;
      appendAbortController.current = null;
      setLoading(true);
      setLoadingMore(false);
    }

    const isCurrentRequest = () => append
      ? requestSequence === appendRequestSequence.current && replaceEpochAtStart === replaceRequestSequence.current
      : requestSequence === replaceRequestSequence.current;

    setError(null);
    try {
      const response = await fetch(`/api/transactions?${buildQuery(filters, cursor)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!isCurrentRequest()) return;
      if (!response.ok) throw new Error(readableError(payload));
      const result = payload as QueryResponse;
      const incoming = Array.isArray(result.rows) ? result.rows : [];
      setRows((current) => Array.from(new Map((append ? [...current, ...incoming] : incoming).map((row) => [row.id, row])).values()));
      setTotalCount(Number.isInteger(result.totalCount) ? result.totalCount : 0);
      setHasMore(result.hasMore === true);
      setNextCursor(result.nextCursor ?? null);
      if (!append) setSelectedIds([]);
    } catch (cause) {
      if (controller.signal.aborted || !isCurrentRequest()) return;
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los movimientos.");
      if (!append) {
        setRows([]);
        setTotalCount(0);
        setHasMore(false);
        setNextCursor(null);
        setSelectedIds([]);
      }
    } finally {
      if (!isCurrentRequest()) return;
      if (append) {
        if (appendAbortController.current === controller) appendAbortController.current = null;
        setLoadingMore(false);
      } else {
        if (replaceAbortController.current === controller) replaceAbortController.current = null;
        setLoading(false);
      }
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
            channels: Array.isArray(payload.channels) ? payload.channels.filter((value: unknown): value is string => typeof value === "string") : [],
            reconciliationStates: Array.isArray(payload.reconciliationStates) ? payload.reconciliationStates.filter((value: unknown): value is string => typeof value === "string") : [],
            years: Array.isArray(payload.years) ? payload.years.filter((value: unknown): value is number => Number.isInteger(value)) : [],
            tags: Array.isArray(payload.tags) ? payload.tags.filter((value: unknown): value is string => typeof value === "string") : [],
          });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los filtros.");
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(filterSearch);
    const accountId = params.get("accountId");
    const categoryId = params.get("categoryId");
    const merchantId = params.get("merchantId");
    const kind = params.get("kind");
    const reviewState = params.get("reviewState");
    const duplicateState = params.get("duplicateState");
    const signMismatch = params.get("signMismatch");
    const channel = params.get("channel");
    const reconciliation = params.get("reconciliation");
    const recurring = params.get("recurring");
    const internalTransfer = params.get("internalTransfer");
    const hasDocument = params.get("hasDocument");
    const tag = params.get("tag");
    const year = params.get("year");
    const month = params.get("month");
    const amountFrom = centsParamToMoneyFilter(params.get("amountFromCents"));
    const amountTo = centsParamToMoneyFilter(params.get("amountToCents"));
    const dateFrom = params.get("dateFrom");
    const dateTo = params.get("dateTo");
    const safeDateFrom = dateFrom && DATE.test(dateFrom) ? dateFrom : "";
    const safeDateTo = dateTo && DATE.test(dateTo) ? dateTo : "";
    const safeDateRange = !safeDateFrom || !safeDateTo || safeDateFrom <= safeDateTo;
    const initialFilters: Filters = {
      ...EMPTY_FILTERS,
      q: (params.get("q") ?? "").trim().slice(0, 200),
      accountId: accountId && UUID.test(accountId) ? accountId : "",
      categoryId: params.get("uncategorized") === "true" ? UNCATEGORIZED : categoryId === UNCATEGORIZED || (categoryId && UUID.test(categoryId)) ? categoryId : "",
      merchantId: merchantId && UUID.test(merchantId) ? merchantId : "",
      kind: kind && Object.prototype.hasOwnProperty.call(KIND_LABELS, kind) ? kind : "",
      reviewState: reviewState && Object.prototype.hasOwnProperty.call(REVIEW_STATE_LABELS, reviewState) ? reviewState : "",
      duplicateState: duplicateState && Object.prototype.hasOwnProperty.call(DUPLICATE_LABELS, duplicateState) ? duplicateState : "",
      signMismatch: signMismatch === "true" ? "true" : "",
      channel: channel ? channel.trim().slice(0, 120) : "",
      counterparty: (params.get("counterparty") ?? "").trim().slice(0, 200),
      reconciliation: reconciliation ? reconciliation.trim().slice(0, 120) : "",
      recurring: recurring === "true" ? "true" : "",
      internalTransfer: internalTransfer === "true" ? "true" : "",
      hasDocument: hasDocument === "true" ? "true" : "",
      documentQuery: (params.get("documentQuery") ?? "").trim().slice(0, 200),
      splitLabel: (params.get("splitLabel") ?? "").trim().slice(0, 200),
      tag: tag ? tag.trim().slice(0, 40) : "",
      ocrQuery: (params.get("ocrQuery") ?? "").trim().slice(0, 200),
      year: year && /^\d{4}$/.test(year) ? year : "",
      month: year && month && /^(?:[1-9]|1[0-2])$/.test(month) ? month : "",
      amountFrom,
      amountTo,
      dateFrom: safeDateRange ? safeDateFrom : "",
      dateTo: safeDateRange ? safeDateTo : "",
    };
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setEditingId(null);
    setEditor(null);
    setConceptError("");
    setCategoryError("");
    setTagsError("");
    setSplittingId(null);
    setReviewingId(null);
    setReviewMode(null);
    setDuplicateGroup([]);
    setTransferCandidates([]);
    setSelectedIds([]);
    setNotice(null);
    void fetchPage(initialFilters, null, false);
    return () => {
      replaceRequestSequence.current += 1;
      appendRequestSequence.current += 1;
      replaceAbortController.current?.abort();
      appendAbortController.current?.abort();
    };
  }, [fetchPage, filterSearch]);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => value.trim() !== "").length,
    [appliedFilters],
  );
  const advancedFilterKeys: Array<keyof Filters> = [
    "merchantId", "reviewState", "duplicateState", "signMismatch", "channel",
    "counterparty", "reconciliation", "recurring", "internalTransfer",
    "hasDocument", "documentQuery", "tag", "ocrQuery", "splitLabel",
    "amountFrom", "amountTo", "year", "month",
  ];
  const advancedDraftCount = advancedFilterKeys.filter((key) => draftFilters[key].trim() !== "").length;
  const advancedAppliedCount = advancedFilterKeys.filter((key) => appliedFilters[key].trim() !== "").length;

  useEffect(() => {
    // Solo los filtros YA APLICADOS (p. ej. desde un enlace) despliegan al entrar.
    // Los borradores no deben reabrir el panel después de cerrarlo manualmente.
    if (advancedAppliedCount > 0) setAdvancedOpen(true);
  }, [advancedAppliedCount]);

  const filtersDirty = useMemo(
    () => (Object.keys(EMPTY_FILTERS) as Array<keyof Filters>).some(
      (key) => draftFilters[key] !== appliedFilters[key],
    ),
    [appliedFilters, draftFilters],
  );

  const activeRootCategories = useMemo(
  () => facets.categories
    .filter((category) => category.lifecycle === "active" && category.parent_category_id === null)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es")),
  [facets.categories],
);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allLoadedSelected = rows.length > 0 && rows.every((row) => selectedSet.has(row.id));

  const visibleSummary = useMemo(() => {
    if (loading) return "Leyendo movimientos…";
    if (totalCount === 0) return "0 movimientos";
    if (rows.length === totalCount) return `${formatInteger(totalCount)} ${totalCount === 1 ? "movimiento" : "movimientos"}`;
    return `${formatInteger(rows.length)} de ${formatInteger(totalCount)}`;
  }, [loading, rows.length, totalCount]);

  useEffect(() => {
    const id = pendingFocusId.current;
    if (!id || loading) return;
    pendingFocusId.current = null;
    const target = document.querySelector<HTMLElement>(`[data-transaction-id="${id}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setNotice((current) => {
      const context = "El movimiento guardado ya no está en el tramo visible o dejó de coincidir con los filtros actuales.";
      return current ? `${current} ${context}` : context;
    });
  }, [loading, rows]);

  function updateFilter(field: keyof Filters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function closeReview() {
    setReviewingId(null);
    setReviewMode(null);
    setDuplicateGroup([]);
    setTransferCandidates([]);
  }

  function navigateFilters(filters: Filters) {
    const params = new URLSearchParams(buildQuery(filters));
    params.delete("limit");
    const query = params.toString();
    const target = `/transactions${query ? `?${query}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` === target) {
      void fetchPage(filters, null, false);
    } else {
      window.history.pushState(null, "", target);
    }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    const amountFromCents = moneyFilterToCents(draftFilters.amountFrom);
    const amountToCents = moneyFilterToCents(draftFilters.amountTo);
    if (Number.isNaN(amountFromCents) || Number.isNaN(amountToCents)) {
      setError("Introduce los importes con hasta dos decimales.");
      return;
    }
    if (amountFromCents !== null && amountToCents !== null && amountFromCents > amountToCents) {
      setError("El importe mínimo no puede ser superior al importe máximo.");
      return;
    }
    const next = { ...draftFilters };
    setAppliedFilters(next);
    setNotice(null);
    setEditingId(null);
    setEditor(null);
    setConceptError("");
    setTagsError("");
    setSplittingId(null);
    closeReview();
    navigateFilters(next);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setNotice(null);
    setEditingId(null);
    setEditor(null);
    setConceptError("");
    setTagsError("");
    setSplittingId(null);
    closeReview();
    navigateFilters(EMPTY_FILTERS);
  }

  function loadMore() {
    if (!nextCursor || loading || loadingMore || saving) return;
    void fetchPage(appliedFilters, nextCursor, true);
  }

  function toggleRow(id: string) {
    if (saving || loading) return;
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < MAX_TRANSACTION_PATCH_SIZE ? [...current, id] : current);
  }

  function toggleAllLoaded() {
    if (saving || loading) return;
    setSelectedIds(allLoadedSelected ? [] : rows.slice(0, MAX_TRANSACTION_PATCH_SIZE).map((row) => row.id));
    if (!allLoadedSelected && rows.length > MAX_TRANSACTION_PATCH_SIZE) {
      setNotice(`Se han seleccionado los primeros ${MAX_TRANSACTION_PATCH_SIZE} movimientos cargados. Puedes editar hasta ${MAX_TRANSACTION_PATCH_SIZE} en cada operación.`);
    }
  }

  async function patchTransactions(ids: string[], patch: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    setAuthRecovery(null);
    setNotice(null);
    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionIds: ids, patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthRecovery(authRecoveryFromCode(requestErrorCode(payload)));
        throw new Error(readableError(payload));
      }
      const changed = payload?.result?.changedTransactions;
      setNotice(Number.isInteger(changed) ? `${message} · ${formatInteger(changed)} modificados.` : message);
      setEditingId(null);
      setEditor(null);
      setSelectedIds([]);
      closeReview();
      if (ids.length === 1) pendingFocusId.current = ids[0];
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
    setSplittingId(null);
    setReviewingId(row.id);
    setReviewMode(mode);
    setReviewLoading(true);
    setDuplicateGroup([]);
    setTransferCandidates([]);
    setEditingId(null);
    setEditor(null);
    setConceptError("");
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
      const focusId = typeof command.transactionId === "string" ? command.transactionId : null;
      if (focusId) pendingFocusId.current = focusId;
      await fetchPage(appliedFilters, null, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la revisión.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(row: TransactionRow) {
  setSplittingId(null);
  setEditingId(row.id);
  setEditor(editorFor(row, facets.categories));
  setConceptError("");
  setCategoryError("");
  setTagsError("");
  setError(null);
  setAuthRecovery(null);
  setNotice(null);
  closeReview();
}

function cancelEdit() {
  setEditingId(null);
  setEditor(null);
  setConceptError("");
  setCategoryError("");
  setTagsError("");
  setAuthRecovery(null);
}

function beginSplit(row: TransactionRow) {
  setSplittingId(row.id);
  setEditingId(null);
  setEditor(null);
  setConceptError("");
  setCategoryError("");
  setTagsError("");
  setError(null);
  setAuthRecovery(null);
  setNotice(null);
  closeReview();
}

function cancelSplit() {
  setSplittingId(null);
  setAuthRecovery(null);
}

async function handleSplitSaved(row: TransactionRow, snapshot: TransactionSplitSummary) {
  setSplittingId(null);
  setNotice(snapshot.exists ? "Reparto guardado y aplicado a la analítica personal." : "Reparto eliminado. El movimiento vuelve a usar el importe bancario completo.");
  pendingFocusId.current = row.id;
  await fetchPage(appliedFilters, null, false);
}

async function saveEdit(row: TransactionRow) {
  if (!editor || editingId !== row.id) return;
  if (!editor.concept.trim()) {
    setError(null);
    setConceptError("El concepto no puede quedar vacío.");
    conceptInputRef.current?.focus();
    return;
  }
  const children = activeSubcategories(facets.categories, editor.categoryRoot);
  if (editor.categoryMode === "set" && editor.categoryRoot !== NONE && children.length > 0 && !editor.categoryLeaf) {
    setError(null);
    setCategoryError("Selecciona una subcategoría.");
    window.requestAnimationFrame(() => subcategorySelectRef.current?.focus());
    return;
  }
  const parsedTags = normalizedTagsFromEditor(editor.tagsText);
  if (parsedTags.error) {
    setError(null);
    setTagsError(parsedTags.error);
    return;
  }
  setConceptError("");
  setCategoryError("");
  setTagsError("");
  await patchTransactions([row.id], individualPatch(row, editor, facets.categories, parsedTags.tags), "Movimiento actualizado");
}

  async function applyBulk() {
    if (selectedIds.length === 0 || selectedIds.length > MAX_TRANSACTION_PATCH_SIZE || loading || saving) return;
    const patch = buildBulkTransactionPatch({
      category: bulkCategory === UNCHANGED
        ? { mode: "unchanged" }
        : bulkCategory === INHERIT
          ? { mode: "inherit" }
          : { mode: "set", id: bulkCategory === NONE ? null : bulkCategory },
      merchant: bulkMerchant === UNCHANGED
        ? { mode: "unchanged" }
        : bulkMerchant === INHERIT
          ? { mode: "inherit" }
          : { mode: "set", id: bulkMerchant === NONE ? null : bulkMerchant },
      reviewState: bulkReviewState === UNCHANGED ? null : bulkReviewState as BulkReviewState,
      analytics: bulkAnalytics === ANALYTICS_INCLUDE ? "include" : bulkAnalytics === ANALYTICS_EXCLUDE ? "exclude" : "unchanged",
    });
    if (Object.keys(patch).length === 0) {
      setError("Selecciona al menos un cambio para aplicar en bloque.");
      return;
    }
    const ok = await patchTransactions(selectedIds, patch, "Edición masiva completada");
    if (ok) {
      setBulkCategory(UNCHANGED);
      setBulkMerchant(UNCHANGED);
      setBulkReviewState(UNCHANGED);
      setBulkAnalytics(UNCHANGED);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link prefetch={false} className={styles.backLink} href="/">← Financial App</Link>
          <p className={styles.eyebrow}>FINANCIAL APP · MOVIMIENTOS</p>
          <h1>Movimientos</h1>
          <p>
            Consulta y gestiona el histórico persistido sin alterar el origen bancario. Cada cambio manual se
            guarda como cambio manual separado y conserva la trazabilidad hasta la fila original.
          </p>
        </div>
        <div className={styles.summary} aria-label="Resumen del listado">
          <div><strong>{formatInteger(totalCount)}</strong><span>Coincidencias</span></div>
          <div><strong>{activeFilterCount}</strong><span>Filtros activos</span></div>
          <div><strong>{formatInteger(selectedIds.length)}</strong><span>Seleccionados</span></div>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters} aria-label="Filtros de movimientos">
        <div className={styles.coreFilters}>
        <label className={styles.searchField}>
          <span>Buscar</span>
          <input value={draftFilters.q} maxLength={200} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Concepto, comercio, contraparte, categoría, canal o nota" />
        </label>
        <label>
          <span>Cuenta</span>
          <select data-testid="account-filter" value={draftFilters.accountId} onChange={(event) => updateFilter("accountId", event.target.value)}>
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
        <label><span>Desde</span><input type="date" value={draftFilters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={draftFilters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
        </div>
        <div className={styles.moreFiltersHeader}>
          <button
            type="button"
            className={styles.moreFiltersButton}
            aria-expanded={advancedOpen}
            aria-controls="movement-advanced-filters"
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            {advancedOpen ? "Ocultar filtros avanzados" : "Más filtros"}
            {advancedAppliedCount > 0 ? ` · ${advancedAppliedCount} aplicados` : advancedDraftCount > 0 ? ` · ${advancedDraftCount} preparados` : ""}
          </button>
          <span role="status" aria-live="polite">
            {advancedAppliedCount > 0
              ? `${advancedAppliedCount} filtros avanzados activos`
              : "Búsqueda, cuenta, categoría, tipo y periodo disponibles arriba"}
          </span>
        </div>
        <div id="movement-advanced-filters" className={styles.advancedFilters} hidden={!advancedOpen}>
        <label>
          <span>Revisión</span>
          <select value={draftFilters.reviewState} onChange={(event) => updateFilter("reviewState", event.target.value)}>
            <option value="">Todas</option>
            {(Object.entries(REVIEW_STATE_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Duplicados</span>
          <select value={draftFilters.duplicateState} onChange={(event) => updateFilter("duplicateState", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(DUPLICATE_LABELS) as Array<[DuplicateState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Calidad</span>
          <select data-testid="sign-mismatch-filter" value={draftFilters.signMismatch} onChange={(event) => updateFilter("signMismatch", event.target.value)}>
            <option value="">Todas</option>
            <option value="true">Signo incoherente</option>
          </select>
        </label>
        <label>
          <span>Canal</span>
          <select value={draftFilters.channel} onChange={(event) => updateFilter("channel", event.target.value)}>
            <option value="">Todos</option>
            {facets.channels.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Contraparte</span>
          <input value={draftFilters.counterparty} maxLength={200} onChange={(event) => updateFilter("counterparty", event.target.value)} placeholder="Nombre o texto de contraparte" />
        </label>
        <label>
          <span>Conciliación</span>
          <select value={draftFilters.reconciliation} onChange={(event) => updateFilter("reconciliation", event.target.value)}>
            <option value="">Todas</option>
            {facets.reconciliationStates.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Recurrente</span>
          <select value={draftFilters.recurring} onChange={(event) => updateFilter("recurring", event.target.value)}>
            <option value="">Todos</option>
            <option value="true">Solo recurrentes confirmados</option>
          </select>
        </label>
        <label>
          <span>Entre cuentas</span>
          <select value={draftFilters.internalTransfer} onChange={(event) => updateFilter("internalTransfer", event.target.value)}>
            <option value="">Todos</option>
            <option value="true">Solo transferencias internas</option>
          </select>
        </label>
        <label>
          <span>Documentos</span>
          <select value={draftFilters.hasDocument} onChange={(event) => updateFilter("hasDocument", event.target.value)}>
            <option value="">Todos</option>
            <option value="true">Con documento asociado</option>
          </select>
        </label>
        <label>
          <span>Buscar en documento</span>
          <input value={draftFilters.documentQuery} maxLength={200} onChange={(event) => updateFilter("documentQuery", event.target.value)} placeholder="Archivo, emisor o nota" />
        </label>
        <label>
          <span>Etiqueta</span>
          <select data-testid="tag-filter" value={draftFilters.tag} onChange={(event) => updateFilter("tag", event.target.value)}>
            <option value="">Todas</option>
            {facets.tags.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Texto OCR</span>
          <input data-testid="ocr-filter" value={draftFilters.ocrQuery} maxLength={200} onChange={(event) => updateFilter("ocrQuery", event.target.value)} placeholder="Texto leído del documento" />
        </label>
        <label>
          <span>Etiqueta de reparto</span>
          <input value={draftFilters.splitLabel} maxLength={200} onChange={(event) => updateFilter("splitLabel", event.target.value)} placeholder="Persona o uso" />
        </label>
        <label>
          <span>Importe mínimo</span>
          <input inputMode="decimal" value={draftFilters.amountFrom} onChange={(event) => updateFilter("amountFrom", event.target.value)} placeholder="-100,00" aria-label="Importe mínimo en euros" />
        </label>
        <label>
          <span>Importe máximo</span>
          <input inputMode="decimal" value={draftFilters.amountTo} onChange={(event) => updateFilter("amountTo", event.target.value)} placeholder="100,00" aria-label="Importe máximo en euros" />
        </label>
        <label>
          <span>Año</span>
          <select value={draftFilters.year} onChange={(event) => setDraftFilters((current) => ({ ...current, year: event.target.value, month: event.target.value ? current.month : "" }))}>
            <option value="">Todos</option>
            {facets.years.map((value) => <option key={value} value={String(value)}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Mes</span>
          <select value={draftFilters.month} disabled={!draftFilters.year} onChange={(event) => updateFilter("month", event.target.value)}>
            <option value="">Todos</option>
            {MONTH_LABELS.map((label, index) => <option key={label} value={String(index + 1)}>{label}</option>)}
          </select>
        </label>
        </div>
        <div className={styles.filterActions}>
          <span className={styles.resultCount} role="status" aria-live="polite">
            {filtersDirty ? "Cambios sin aplicar" : "La tabla refleja estos filtros"}
          </span>
          <button className={styles.primaryButton} type="submit" disabled={saving || !filtersDirty}>
            {filtersDirty ? "Aplicar filtros" : "Filtros aplicados"}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={clearFilters} disabled={saving}>Limpiar</button>
        </div>
      </form>

      {selectedIds.length > 0 && (
        <section className={styles.bulkBar} aria-label="Edición masiva de movimientos">
          <div className={styles.bulkIntro}><strong>{formatInteger(selectedIds.length)} seleccionados</strong><span>Edita hasta 200 movimientos por operación. Tus cambios se guardan sin alterar los datos del banco.</span></div>
          <label><span>Categoría</span><select data-testid="bulk-category" value={bulkCategory} disabled={saving || loading} onChange={(event) => setBulkCategory(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option><option value={NONE}>Sin categoría</option>
            {facets.categories.filter((category) => category.lifecycle === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label><span>Comercio</span><select data-testid="bulk-merchant" value={bulkMerchant} disabled={saving || loading} onChange={(event) => setBulkMerchant(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar detectado</option><option value={NONE}>Sin comercio</option>
            {facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
          </select></label>
          <label><span>Revisión</span><select data-testid="bulk-review-state" value={bulkReviewState} disabled={saving || loading} onChange={(event) => setBulkReviewState(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option>
            {(Object.entries(REVIEW_STATE_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Analítica</span><select data-testid="bulk-analytics" value={bulkAnalytics} disabled={saving || loading} onChange={(event) => setBulkAnalytics(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={ANALYTICS_INCLUDE}>Incluir en analítica</option><option value={ANALYTICS_EXCLUDE}>Excluir de analítica</option>
          </select></label>
          <button data-testid="bulk-apply" className={styles.primaryButton} type="button" onClick={() => void applyBulk()} disabled={saving || loading || (bulkCategory === UNCHANGED && bulkMerchant === UNCHANGED && bulkReviewState === UNCHANGED && bulkAnalytics === UNCHANGED)}>Aplicar cambios</button>
          <button className={styles.secondaryButton} type="button" onClick={() => setSelectedIds([])} disabled={saving || loading}>Quitar selección</button>
        </section>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
      {authRecovery ? <DraftRecoveryNotice state={authRecovery} nextPath="/transactions" /> : null}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.panel} aria-labelledby="transaction-list-heading">
        <div className={styles.panelHeading}>
          <div><p className={styles.kicker}>HISTÓRICO EFECTIVO</p><h2 id="transaction-list-heading">Listado</h2></div>
          <div className={styles.headingActions}>
            <button className={styles.secondaryButton} type="button" onClick={toggleAllLoaded} disabled={rows.length === 0 || loading || saving}>{allLoadedSelected ? "Deseleccionar cargados" : "Seleccionar cargados"}</button>
            <span className={styles.resultCount}>{visibleSummary}</span>
          </div>
        </div>

        {loading ? <div className={styles.loading} role="status">Leyendo movimientos persistidos…</div> : rows.length === 0 ? <div className={styles.empty}>{appliedFilters.signMismatch === "true" ? "No hay movimientos con el signo incoherente." : "No hay movimientos que coincidan con los filtros actuales."}</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th scope="col" className={styles.selectHeading}>Sel.</th><th scope="col">Fecha</th><th scope="col">Concepto y trazabilidad</th><th scope="col">Cuenta</th><th scope="col">Categoría</th><th scope="col" className={styles.amountHeading}>Importe</th><th scope="col">Gestión</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className={selectedSet.has(row.id) ? styles.selectedRow : undefined}
                      data-transaction-id={row.id}
                      tabIndex={-1}
                    >
                      <td data-label="Seleccionar" className={styles.selectCell}><label className={styles.selectTarget}><input data-testid={`select-${row.id}`} aria-label={`Seleccionar ${row.concept.effective}`} type="checkbox" checked={selectedSet.has(row.id)} disabled={saving || (!selectedSet.has(row.id) && selectedIds.length >= MAX_TRANSACTION_PATCH_SIZE)} onChange={() => toggleRow(row.id)} /></label></td>
                      <td data-label="Fecha"><time dateTime={row.bankDate}>{formatDate(row.bankDate)}</time></td>
                      <td data-label="Concepto" className={styles.conceptCell}>
                        <div className={styles.conceptTop}><strong>{row.concept.effective}</strong>{row.overriddenFields.some((field) => field !== "reviewState") && <span className={styles.overrideChip}>Modificado</span>}{row.split?.active && <span className={styles.splitChip}>Repartido</span>}{row.split?.stale && <span className={styles.staleSplitChip}>Reparto por revisar</span>}{row.excludedFromAnalytics && <span className={styles.mutedChip}>Fuera de analítica</span>}{row.duplicateState !== "none" && <span className={styles.duplicateChip}>{DUPLICATE_LABELS[row.duplicateState]}</span>}{row.signMismatch && <span className={styles.anomalyChip}>Signo incoherente</span>}{row.transferPairId && <span className={styles.transferChip}>Transferencia emparejada</span>}</div>
                        <p>{row.merchant.effectiveName ?? "Sin comercio"}</p>
                        <details className={styles.trace}><summary>Detalle y trazabilidad</summary><dl>
                          <div><dt>Concepto original</dt><dd>{row.concept.original}</dd></div><div><dt>Concepto procesado</dt><dd>{row.concept.processed}</dd></div><div><dt>Concepto efectivo</dt><dd>{row.concept.effective}</dd></div>
                          <div><dt>Comercio original</dt><dd>{row.merchant.originalName ?? "—"}</dd></div><div><dt>Comercio efectivo</dt><dd>{row.merchant.effectiveName ?? "—"}</dd></div>
                          <div><dt>Categoría original</dt><dd>{row.category.originalName ?? "—"}</dd></div><div><dt>Categoría efectiva</dt><dd>{row.category.effectiveName ?? "—"}</dd></div>
                          <div><dt>Tipo original / efectivo</dt><dd>{KIND_LABELS[row.kind.original]} / {KIND_LABELS[row.kind.effective]}</dd></div><div><dt>Saldo tras movimiento</dt><dd>{formatMoney(row.balanceAfterCents)}</dd></div>
                          {row.signMismatch && <div><dt>Control de signo</dt><dd>El tipo financiero y el signo bancario no coinciden. El importe original no se ha modificado.</dd></div>}
                          <div><dt>Etiquetas</dt><dd>{Array.isArray(row.tags) && row.tags.length > 0 ? row.tags.join(", ") : "—"}</dd></div>
                          <div><dt>Canal</dt><dd>{row.source.channel ?? "—"}</dd></div><div><dt>Contraparte</dt><dd>{row.source.counterparty ?? "—"}</dd></div><div><dt>Conciliación</dt><dd>{row.source.reconciliation ?? "—"}</dd></div><div><dt>Subcategoría de origen</dt><dd>{row.source.sourceSubcategory ?? "—"}</dd></div>
                          <div><dt>Fila de origen</dt><dd>{row.source.sourceRowKey}</dd></div><div><dt>Hoja de origen</dt><dd>{row.source.sourceSheetId ?? "—"}</dd></div><div><dt>Registro fuente</dt><dd>{row.source.sourceRecordId}</dd></div><div><dt>Identidad fuente</dt><dd>{row.source.sourceRowIdentity}</dd></div><div><dt>Fingerprint</dt><dd>{row.source.sourceFingerprint}</dd></div>
                          {row.transferPairId && <div><dt>Transferencia emparejada</dt><dd>{row.transferPairId}</dd></div>}
                          {row.split?.exists && <><div><dt>Importe bancario</dt><dd>{formatMoney(row.amountCents)}</dd></div><div><dt>Parte personal</dt><dd>{formatMoney(row.split.personalAmountCents)}</dd></div><div><dt>Parte de otras personas</dt><dd>{formatMoney(row.split.otherAmountCents)}</dd></div><div><dt>Estado del reparto</dt><dd>{row.split.stale ? "Revisar tras cambio bancario" : row.split.active ? "Activo" : "Inactivo"}</dd></div></>}
                          {row.overriddenFields.some((field) => field !== "reviewState") && <div><dt>Campos modificados</dt><dd>{row.overriddenFields.filter((field) => field !== "reviewState").map((field) => OVERRIDE_LABELS[field] ?? field).join(", ")}</dd></div>}{row.userNote && <div><dt>Nota</dt><dd>{row.userNote}</dd></div>}
                        </dl></details>
                      </td>
                      <td data-label="Cuenta">{row.account.name}</td>
                      <td data-label="Categoría">{row.split?.active && row.split.categoryCount > 1 ? <span className={styles.multiCategory}>Varias categorías</span> : <CategoryIdentity categoryId={row.category.effectiveId} name={row.category.effectiveName} />}</td>
                      <td data-label="Importe" className={`${styles.amount} ${row.amountCents >= 0 ? styles.positive : styles.negative}`}><div>{formatMoney(row.amountCents)}</div>{row.split?.active ? <small className={styles.amountBreakdown}>Personal: {formatMoney(row.split.personalAmountCents)}</small> : row.split?.stale ? <small className={styles.amountBreakdown}>Reparto por revisar</small> : null}</td>
                      <td data-label="Gestión"><div className={styles.rowActions}>
                        <button data-testid={`edit-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => beginEdit(row)} disabled={saving}>Editar</button>
                        {(row.split?.canSplit || row.split?.exists) && <button data-testid={`split-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => beginSplit(row)} disabled={saving}>{row.split?.exists ? "Reparto" : "Repartir"}</button>}
                        {row.duplicateState !== "none" && <button data-testid={`review-duplicate-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => void openReview(row, "duplicate")} disabled={saving || reviewLoading}>Duplicado</button>}
                        {row.kind.effective === "transfer" && <button data-testid={`review-transfer-${row.id}`} className={styles.secondaryButton} type="button" onClick={() => void openReview(row, "transfer")} disabled={saving || reviewLoading}>{row.transferPairId ? "Ver pareja" : "Emparejar"}</button>}
                      </div></td>
                    </tr>
                    {editingId === row.id && editor && (
                      <tr className={styles.editorRow}><td colSpan={7}>
                        <section className={styles.editor} aria-label={`Editar ${row.concept.effective}`}>
                          <div className={styles.editorHeading}><div><strong>Editar movimiento</strong><p>El registro bancario original permanece intacto. Tus cambios solo se aplican en Financial App.</p></div></div>
                          <div className={styles.editorGrid}>
                            <label className={`${styles.editorField} ${styles.conceptField}`}>
                              <span>Concepto</span>
                              <input
                                ref={conceptInputRef}
                                data-testid="edit-concept"
                                value={editor.concept}
                                maxLength={240}
                                aria-invalid={conceptError ? "true" : "false"}
                                aria-describedby={conceptError ? CONCEPT_ERROR_ID : undefined}
                                onChange={(event) => {
                                  setEditor({ ...editor, concept: event.target.value });
                                  if (conceptError) setConceptError("");
                                }}
                              />
                              {conceptError ? <small id={CONCEPT_ERROR_ID} className={styles.fieldError} role="alert">{conceptError}</small> : null}
                            </label>
                            <label className={`${styles.editorField} ${styles.merchantField}`}><span>Comercio</span><select data-testid="edit-merchant" value={editor.merchant} onChange={(event) => setEditor({ ...editor, merchantMode: "set", merchant: event.target.value })}><option value={NONE}>Sin comercio</option>{facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select>{editor.merchantMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving} onClick={() => setEditor({ ...editor, merchantMode: "inherit", merchant: row.merchant.originalId ?? NONE })}>Restaurar valor detectado: {row.merchant.originalName ?? "Sin comercio"}</button> : null}</label>
                            <label className={`${styles.editorField} ${styles.categoryField}`}><span>Categoría</span><select data-testid="edit-category-root" value={editor.categoryRoot} onChange={(event) => {
                    const categoryRoot = event.target.value;
                    setEditor({ ...editor, categoryMode: "set", categoryRoot, categoryLeaf: "" });
                    setCategoryError("");
                  }}><option value={NONE}>Sin categoría</option>{activeRootCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><small className={styles.assignmentHint}>{editor.categoryMode === "inherit" ? "Origen: clasificación detectada" : "Origen: ajuste manual"}</small></label>
                  <label className={`${styles.editorField} ${styles.subcategoryField}`}><span>Subcategoría</span><select ref={subcategorySelectRef} data-testid="edit-subcategory" value={editor.categoryLeaf} disabled={editor.categoryRoot === NONE || activeSubcategories(facets.categories, editor.categoryRoot).length === 0} aria-invalid={categoryError ? "true" : "false"} aria-describedby={categoryError ? SUBCATEGORY_ERROR_ID : undefined} onChange={(event) => {
                    setEditor({ ...editor, categoryMode: "set", categoryLeaf: event.target.value });
                    setCategoryError("");
                  }}>{activeSubcategories(facets.categories, editor.categoryRoot).length > 0 ? <><option value="">Selecciona una subcategoría</option>{activeSubcategories(facets.categories, editor.categoryRoot).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</> : <option value="">No hay subcategorías</option>}</select>{categoryError ? <small id={SUBCATEGORY_ERROR_ID} className={styles.fieldError} role="alert">{categoryError}</small> : null}</label>
                  <div className={styles.categoryAssignment}>
                    <small>Clasificación detectada: {row.category.originalName ?? "Sin categoría"}</small>
                    {editor.categoryMode === "set" ? <button data-testid="reset-category-auto" className={styles.secondaryButton} type="button" disabled={saving} onClick={() => {
                      const automatic = categorySelectionFor(facets.categories, row.category.originalId);
                      setEditor({ ...editor, categoryMode: "inherit", categoryRoot: automatic.root, categoryLeaf: automatic.leaf });
                      setCategoryError("");
                    }}>Restaurar clasificación detectada</button> : null}
                  </div>
                            <label className={`${styles.editorField} ${styles.typeField}`}><span>Tipo</span><select data-testid="edit-kind" value={editor.kind} disabled={Boolean(row.transferPairId)} onChange={(event) => setEditor({ ...editor, kindMode: "set", kind: event.target.value })}>{(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editor.kindMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving || Boolean(row.transferPairId)} onClick={() => setEditor({ ...editor, kindMode: "inherit", kind: row.kind.original })}>Restaurar valor detectado: {KIND_LABELS[row.kind.original]}</button> : row.transferPairId ? <small>Desempareja la transferencia antes de cambiar su tipo.</small> : null}</label>
                            <label className={`${styles.editorField} ${styles.noteField}`}><span>Nota</span><textarea value={editor.note} maxLength={2000} rows={3} onChange={(event) => setEditor({ ...editor, note: event.target.value })} /></label>
                            <label className={`${styles.editorField} ${styles.noteField}`}>
                              <span>Etiquetas</span>
                              <input data-testid="edit-tags" value={editor.tagsText} aria-invalid={tagsError ? "true" : "false"} aria-describedby={tagsError ? TAGS_ERROR_ID : undefined} onChange={(event) => { setEditor({ ...editor, tagsText: event.target.value }); if (tagsError) setTagsError(""); }} placeholder="Ej.: trabajo, reembolsable, viaje" />
                              <small>Hasta 12 etiquetas, separadas por comas. No modifican el movimiento bancario.</small>
                              {tagsError ? <small id={TAGS_ERROR_ID} className={styles.fieldError} role="alert">{tagsError}</small> : null}
                            </label>
                            <label className={`${styles.checkboxLabel} ${styles.analyticsField}`}><input type="checkbox" checked={editor.excludedFromAnalytics} onChange={(event) => setEditor({ ...editor, excludedFromAnalytics: event.target.checked })} /><span>Excluir de analítica</span></label>
                          </div>
                          <div className={styles.editorActions}><button className={styles.secondaryButton} type="button" onClick={cancelEdit} disabled={saving}>Cancelar</button><button data-testid="save-edit" className={styles.primaryButton} type="button" onClick={() => void saveEdit(row)} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
                        </section>
                      </td></tr>
                    )}
                    {splittingId === row.id && row.split && (
                      <tr className={styles.editorRow}><td colSpan={7}>
                        <TransactionSplitEditor
                          transaction={{ id: row.id, amountCents: row.amountCents, concept: row.concept.effective, split: row.split }}
                          categories={facets.categories}
                          disabled={saving}
                          onBusyChange={setSaving}
                          onSaved={(snapshot) => handleSplitSaved(row, snapshot)}
                          onCancel={cancelSplit}
                        />
                      </td></tr>
                    )}
                    {reviewingId === row.id && reviewMode && (
                      <tr className={styles.reviewRow}><td colSpan={7}>
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
