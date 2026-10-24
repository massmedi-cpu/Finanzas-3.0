import {
  callPersistenceGatewayBatch,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { prepareGlobalSearchQuery } from "../../global-search-policy";
import { isDocumentsDeferred, isReleaseHrefAvailable } from "../../../src/application/release-document-scope";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const MAX_RESULTS = 18;

type SearchKind = "transaction" | "document" | "merchant" | "category" | "account" | "section";

type SearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  href: string;
  amountCents?: number | null;
  date?: string | null;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-ES")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(value: unknown, normalizedQuery: string) {
  const candidate = text(value);
  return candidate ? normalize(candidate).includes(normalizedQuery) : false;
}

function safeRows(value: unknown, key = "rows") {
  const root = record(value);
  return Array.isArray(root?.[key]) ? root[key] as unknown[] : [];
}

const SECTIONS = [
  { id: "home", title: "Inicio", keywords: "inicio resumen portada", href: "/" },
  { id: "transactions", title: "Movimientos", keywords: "movimientos transacciones gastos ingresos compras", href: "/transactions" },
  { id: "analysis", title: "Análisis", keywords: "analisis graficas gasto ingresos ahorro tendencias", href: "/analysis" },
  { id: "compare", title: "Comparador", keywords: "comparar comparacion periodos referencia diferencias categorias comercios", href: "/compare" },
  { id: "accounts", title: "Cuentas", keywords: "cuentas saldos banco", href: "/accounts" },
  { id: "budgets", title: "Presupuestos", keywords: "presupuesto limites categorias gasto", href: "/budgets" },
  { id: "recurrences", title: "Recurrentes", keywords: "recurrentes recibos suscripciones pagos habituales", href: "/recurrences" },
  { id: "forecast", title: "Previsión", keywords: "prevision futuros proximos pagos ingresos", href: "/forecast" },
  { id: "documents", title: "Documentos", keywords: "documentos facturas tickets recibos pdf ocr", href: "/documents" },
  { id: "review", title: "Para revisar", keywords: "revisar duplicados pendientes incidencias", href: "/review" },
  { id: "alerts", title: "Alertas", keywords: "alertas avisos incidencias presupuesto duplicados pagos documentos sincronizacion", href: "/alerts" },
  { id: "configuration", title: "Configuración", keywords: "configuracion ajustes fuente drive", href: "/configuration" },
] as const;

function sectionResults(normalizedQuery: string): SearchItem[] {
  return SECTIONS
    .filter((section) => isReleaseHrefAvailable(section.href))
    .filter((section) => normalize(`${section.title} ${section.keywords}`).includes(normalizedQuery))
    .slice(0, 4)
    .map((section) => ({
      id: `section:${section.id}`,
      kind: "section" as const,
      title: section.title,
      subtitle: "Abrir sección",
      href: section.href,
    }));
}

function transactionHref(row: RecordValue) {
  const account = record(row.account);
  const merchant = record(row.merchant);
  const category = record(row.category);
  const bankDate = text(row.bankDate);
  const params = new URLSearchParams();
  if (bankDate) {
    params.set("dateFrom", bankDate);
    params.set("dateTo", bankDate);
  }
  const accountId = text(account?.id);
  const merchantId = text(merchant?.effectiveId);
  const categoryId = text(category?.effectiveId);
  if (accountId) params.set("accountId", accountId);
  if (merchantId) params.set("merchantId", merchantId);
  else if (categoryId) params.set("categoryId", categoryId);
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}

function transactionResults(payload: unknown): SearchItem[] {
  return safeRows(payload).slice(0, 6).flatMap((raw) => {
    const row = record(raw);
    if (!row) return [];
    const concept = record(row.concept);
    const merchant = record(row.merchant);
    const category = record(row.category);
    const account = record(row.account);
    const id = text(row.id);
    if (!id) return [];
    const title = text(merchant?.effectiveName) ?? text(concept?.effective) ?? text(concept?.processed) ?? "Movimiento";
    const conceptText = text(concept?.effective);
    const details = [text(row.bankDate), text(account?.name), text(category?.effectiveName)].filter(Boolean).join(" · ");
    return [{
      id: `transaction:${id}`,
      kind: "transaction" as const,
      title,
      subtitle: conceptText && conceptText !== title ? `${conceptText}${details ? ` · ${details}` : ""}` : details || null,
      href: transactionHref(row),
      amountCents: finiteNumber(row.amountCents),
      date: text(row.bankDate),
    }];
  });
}

function documentResults(payload: unknown, query: string): SearchItem[] {
  return safeRows(payload, "items").slice(0, 6).flatMap((raw) => {
    const row = record(raw);
    if (!row) return [];
    const id = text(row.id);
    if (!id) return [];
    const issuer = text(row.issuerName);
    const fileName = text(row.originalFileName);
    const title = issuer ?? fileName ?? "Documento";
    const details = [text(row.documentDate), fileName && fileName !== title ? fileName : null].filter(Boolean).join(" · ");
    return [{
      id: `document:${id}`,
      kind: "document" as const,
      title,
      subtitle: details || "Documento",
      href: `/documents?q=${encodeURIComponent(query)}&documentId=${encodeURIComponent(id)}`,
      amountCents: finiteNumber(row.totalCents),
      date: text(row.documentDate),
    }];
  });
}

function facetResults(payload: unknown, normalizedQuery: string): SearchItem[] {
  const root = record(payload);
  if (!root) return [];
  const groups: Array<{ key: "merchants" | "categories" | "accounts"; kind: "merchant" | "category" | "account"; param: string; label: string }> = [
    { key: "merchants", kind: "merchant", param: "merchantId", label: "Comercio" },
    { key: "categories", kind: "category", param: "categoryId", label: "Categoría" },
    { key: "accounts", kind: "account", param: "accountId", label: "Cuenta" },
  ];
  const results: SearchItem[] = [];
  for (const group of groups) {
    const rows = Array.isArray(root[group.key]) ? root[group.key] as unknown[] : [];
    for (const raw of rows) {
      const row = record(raw);
      if (!row || !matches(row.name, normalizedQuery)) continue;
      const id = text(row.id);
      const name = text(row.name);
      if (!id || !name) continue;
      const lifecycle = text(row.lifecycle);
      results.push({
        id: `${group.kind}:${id}`,
        kind: group.kind,
        title: name,
        subtitle: `${group.label}${lifecycle === "archived" ? " · archivado" : ""}`,
        href: `/transactions?${group.param}=${encodeURIComponent(id)}`,
      });
      if (results.length >= 8) return results;
    }
  }
  return results;
}

export type GlobalSearchSource = "transactions" | "documents" | "facets";

/**
 * HTTP 200 alone does not establish an empty bank/document search. The
 * gateway must return its documented container shape. Any malformed source
 * is treated like a failed source, so a partial search never claims that the
 * missing matches do not exist.
 */
export function verifiedGlobalSearchSource(
  result: PromiseSettledResult<unknown>,
  source: GlobalSearchSource,
): PromiseSettledResult<unknown> {
  if (result.status === "rejected") return result;
  const root = record(result.value);
  const rows = source === "transactions" ? root?.rows
    : source === "documents" ? root?.items : null;
  const valid = source === "facets"
    ? Boolean(root && (["merchants", "categories", "accounts"] as const).every((key) =>
      Array.isArray(root[key]) && root[key].every((value: unknown) => {
        const row = record(value);
        return row && text(row.id) !== null && text(row.name) !== null;
      })))
    : Array.isArray(rows) && rows.every((value: unknown) => {
      const row = record(value);
      return row && text(row.id) !== null
        && (row.amountCents === undefined || row.amountCents === null || Number.isSafeInteger(row.amountCents))
        && (row.totalCents === undefined || row.totalCents === null || Number.isSafeInteger(row.totalCents));
    });
  return valid ? result : { status: "rejected", reason: new Error("invalid_global_search_source_contract") };
}

/**
 * A result page containing only hardcoded section links is not proof that
 * banking transactions or private documents had zero matches. If every data
 * source fails, return an error so the UI offers recovery instead of "no
 * results". Partial failures remain useful with an explicit partial marker.
 */
export function allGlobalSearchSourcesFailed(results: readonly PromiseSettledResult<unknown>[]) {
  return results.length > 0 && results.every((result) => result.status === "rejected");
}

const SESSION_ERRORS = new Set([
  "workspace_context_required",
  "workspace_user_invalid",
  "workspace_access_denied",
  "workspace_membership_ambiguous",
  "workspace_membership_invalid",
]);

export function globalSearchNeedsSession(results: readonly PromiseSettledResult<unknown>[]) {
  return allGlobalSearchSourcesFailed(results) && results.every((result) =>
    result.status === "rejected"
    && result.reason instanceof PersistenceGatewayError
    && (result.reason.status === 401 || result.reason.status === 403)
    && SESSION_ERRORS.has(result.reason.code ?? ""),
  );
}

export function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "search_unavailable", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  console.error("global-search-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "search_unavailable", code: null }, { status: 500, headers: HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // A global search must not claim completeness for an ambiguous query.
    // Validate even when q is blank, before any private gateway request.
    if ([...searchParams.keys()].some((key) => key !== "q" || searchParams.getAll(key).length !== 1)) {
      return Response.json(
        { error: "invalid_request", code: "invalid_search_query_parameters" },
        { status: 400, headers: HEADERS },
      );
    }
    const rawQuery = searchParams.get("q") ?? "";
    const query = prepareGlobalSearchQuery(rawQuery);
    if (!query) {
      return Response.json({ query: rawQuery.trim(), items: [], partial: false }, { headers: HEADERS });
    }

    const normalizedQuery = normalize(query);
    const documentsEnabled = !isDocumentsDeferred();
    const [transactionResponse, facetResponse, documentResponse] = await callPersistenceGatewayBatch([
      { action: "transaction.query", payload: { query, limit: 6 } },
      { action: "transaction.facets" },
      ...(documentsEnabled ? [{ action: "document.list", payload: { status: null, query, limit: 6, offset: 0 } }] : []),
    ]);

    const transactions = verifiedGlobalSearchSource(transactionResponse, "transactions");
    const documents = documentsEnabled ? verifiedGlobalSearchSource(documentResponse, "documents") : null;
    const facets = verifiedGlobalSearchSource(facetResponse, "facets");
    const sourceResults = documents ? [transactions, documents, facets] : [transactions, facets];
    if (allGlobalSearchSourcesFailed(sourceResults)) {
      const sessionRequired = globalSearchNeedsSession(sourceResults);
      return Response.json(
        {
          error: sessionRequired ? "workspace_session_required" : "search_unavailable",
          code: sessionRequired ? "workspace_session_required" : "all_search_sources_failed",
          query,
          items: [],
          partial: true,
        },
        { status: sessionRequired ? 403 : 503, headers: HEADERS },
      );
    }

    const items = [
      ...sectionResults(normalizedQuery),
      ...(transactions.status === "fulfilled" ? transactionResults(transactions.value) : []),
      ...(documents?.status === "fulfilled" ? documentResults(documents.value, query) : []),
      ...(facets.status === "fulfilled" ? facetResults(facets.value, normalizedQuery) : []),
    ].slice(0, MAX_RESULTS);

    return Response.json({
      query,
      items,
      partial: sourceResults.some((result) => result.status === "rejected"),
    }, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
