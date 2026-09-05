"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./transactions.module.css";

type Lifecycle = "active" | "archived";
type TransactionKind = "income" | "expense" | "transfer" | "refund" | "adjustment";
type ReviewState = "confirmed" | "pending" | "needs_review";
type DuplicateState = "none" | "suspected" | "confirmed";

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
    ["categoryId", "categoryId"],
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
  return "No se pudieron leer los movimientos persistidos.";
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
  const [error, setError] = useState<string | null>(null);

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los movimientos.");
      if (!append) {
        setRows([]);
        setTotalCount(0);
        setHasMore(false);
        setNextCursor(null);
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

  const visibleSummary = useMemo(() => {
    if (loading) return "Leyendo movimientos…";
    if (totalCount === 0) return "0 movimientos";
    if (rows.length === totalCount) return `${totalCount.toLocaleString("es-ES")} movimientos`;
    return `${rows.length.toLocaleString("es-ES")} de ${totalCount.toLocaleString("es-ES")}`;
  }, [loading, rows.length, totalCount]);

  function updateFilter(field: keyof Filters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    const next = { ...draftFilters };
    setAppliedFilters(next);
    void fetchPage(next, null, false);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void fetchPage(EMPTY_FILTERS, null, false);
  }

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    void fetchPage(appliedFilters, nextCursor, true);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/">← Financial App</Link>
          <p className={styles.eyebrow}>FASE 4 · MOVIMIENTOS</p>
          <h1>Movimientos</h1>
          <p>
            Consulta el histórico persistido sin alterar el origen bancario. Los valores efectivos combinan
            el dato procesado con tus overrides, conservando siempre trazabilidad hasta la fila original.
          </p>
        </div>
        <div className={styles.summary} aria-label="Resumen del listado">
          <div><strong>{totalCount.toLocaleString("es-ES")}</strong><span>Coincidencias</span></div>
          <div><strong>{activeFilterCount}</strong><span>Filtros activos</span></div>
          <div><strong>{rows.length.toLocaleString("es-ES")}</strong><span>Cargados</span></div>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters} aria-label="Filtros de movimientos">
        <label className={styles.searchField}>
          <span>Buscar</span>
          <input
            value={draftFilters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Concepto, comercio, categoría o cuenta"
          />
        </label>
        <label>
          <span>Cuenta</span>
          <select value={draftFilters.accountId} onChange={(event) => updateFilter("accountId", event.target.value)}>
            <option value="">Todas</option>
            {facets.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}{account.lifecycle === "archived" ? " · archivada" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Categoría</span>
          <select value={draftFilters.categoryId} onChange={(event) => updateFilter("categoryId", event.target.value)}>
            <option value="">Todas</option>
            {facets.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}{category.lifecycle === "archived" ? " · archivada" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Comercio</span>
          <select value={draftFilters.merchantId} onChange={(event) => updateFilter("merchantId", event.target.value)}>
            <option value="">Todos</option>
            {facets.merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>{merchant.name}{merchant.lifecycle === "archived" ? " · archivado" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select value={draftFilters.kind} onChange={(event) => updateFilter("kind", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Revisión</span>
          <select value={draftFilters.reviewState} onChange={(event) => updateFilter("reviewState", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Duplicados</span>
          <select value={draftFilters.duplicateState} onChange={(event) => updateFilter("duplicateState", event.target.value)}>
            <option value="">Todos</option>
            {(Object.entries(DUPLICATE_LABELS) as Array<[DuplicateState, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Desde</span>
          <input type="date" value={draftFilters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={draftFilters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
        </label>
        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit" disabled={loading}>Aplicar filtros</button>
          <button className={styles.secondaryButton} type="button" onClick={clearFilters} disabled={loading}>Limpiar</button>
        </div>
      </form>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <section className={styles.panel} aria-labelledby="transaction-list-heading">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.kicker}>HISTÓRICO EFECTIVO</p>
            <h2 id="transaction-list-heading">Listado</h2>
          </div>
          <span className={styles.resultCount}>{visibleSummary}</span>
        </div>

        {loading ? (
          <div className={styles.loading} role="status">Leyendo movimientos persistidos…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>No hay movimientos que coincidan con los filtros actuales.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto y trazabilidad</th>
                  <th>Cuenta</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th className={styles.amountHeading}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Fecha"><time dateTime={row.bankDate}>{formatDate(row.bankDate)}</time></td>
                    <td data-label="Concepto" className={styles.conceptCell}>
                      <div className={styles.conceptTop}>
                        <strong>{row.concept.effective}</strong>
                        {row.hasUserOverride && <span className={styles.overrideChip}>Modificado</span>}
                        {row.excludedFromAnalytics && <span className={styles.mutedChip}>Fuera de analítica</span>}
                      </div>
                      <p>{row.merchant.effectiveName ?? "Sin comercio"}</p>
                      <details className={styles.trace}>
                        <summary>Detalle y trazabilidad</summary>
                        <dl>
                          <div><dt>Concepto original</dt><dd>{row.concept.original}</dd></div>
                          <div><dt>Concepto procesado</dt><dd>{row.concept.processed}</dd></div>
                          <div><dt>Concepto efectivo</dt><dd>{row.concept.effective}</dd></div>
                          <div><dt>Comercio original</dt><dd>{row.merchant.originalName ?? "—"}</dd></div>
                          <div><dt>Comercio efectivo</dt><dd>{row.merchant.effectiveName ?? "—"}</dd></div>
                          <div><dt>Categoría original</dt><dd>{row.category.originalName ?? "—"}</dd></div>
                          <div><dt>Categoría efectiva</dt><dd>{row.category.effectiveName ?? "—"}</dd></div>
                          <div><dt>Tipo original / efectivo</dt><dd>{KIND_LABELS[row.kind.original]} / {KIND_LABELS[row.kind.effective]}</dd></div>
                          <div><dt>Saldo tras movimiento</dt><dd>{formatMoney(row.balanceAfterCents)}</dd></div>
                          <div><dt>Fila de origen</dt><dd>{row.source.sourceRowKey}</dd></div>
                          <div><dt>Hoja de origen</dt><dd>{row.source.sourceSheetId ?? "—"}</dd></div>
                          <div><dt>Registro fuente</dt><dd>{row.source.sourceRecordId}</dd></div>
                          <div><dt>Identidad fuente</dt><dd>{row.source.sourceRowIdentity}</dd></div>
                          <div><dt>Fingerprint</dt><dd>{row.source.sourceFingerprint}</dd></div>
                          {row.overriddenFields.length > 0 && (
                            <div><dt>Campos modificados</dt><dd>{row.overriddenFields.map((field) => OVERRIDE_LABELS[field] ?? field).join(", ")}</dd></div>
                          )}
                          {row.userNote && <div><dt>Nota</dt><dd>{row.userNote}</dd></div>}
                        </dl>
                      </details>
                    </td>
                    <td data-label="Cuenta">{row.account.name}</td>
                    <td data-label="Categoría">{row.category.effectiveName ?? <span className={styles.muted}>Sin categoría</span>}</td>
                    <td data-label="Estado">
                      <div className={styles.statusStack}>
                        <span className={`${styles.stateChip} ${styles[row.reviewState.effective]}`}>{REVIEW_LABELS[row.reviewState.effective]}</span>
                        {row.duplicateState !== "none" && <span className={styles.duplicateChip}>{DUPLICATE_LABELS[row.duplicateState]}</span>}
                      </div>
                    </td>
                    <td data-label="Importe" className={`${styles.amount} ${row.amountCents >= 0 ? styles.positive : styles.negative}`}>
                      {formatMoney(row.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className={styles.pagination}>
            <span>{visibleSummary}</span>
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loadingMore || !nextCursor}>
                {loadingMore ? "Cargando…" : "Cargar 50 más"}
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
