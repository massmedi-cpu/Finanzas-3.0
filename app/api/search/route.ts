import {
  callPersistenceGatewayBatch,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

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
  { id: "configuration", title: "Configuración", keywords: "configuracion ajustes fuente drive", href: "/configuration" },
] as const;

function sectionResults(normalizedQuery: string): SearchItem[] {
  return SECTIONS
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

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "search_unavailable", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  console.error("global-search", error instanceof Error ? error.message : String(error));
  return Response.json({ error: "invalid_search", code: null }, { status: 400, headers: HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 120) {
      return Response.json({ query, items: [], partial: false }, { headers: HEADERS });
    }

    const normalizedQuery = normalize(query);
    const [transactions, documents, facets] = await callPersistenceGatewayBatch([
      { action: "transaction.query", payload: { query, limit: 6 } },
      { action: "document.list", payload: { status: null, query, limit: 6, offset: 0 } },
      { action: "transaction.facets" },
    ]);

    const items = [
      ...sectionResults(normalizedQuery),
      ...(transactions.status === "fulfilled" ? transactionResults(transactions.value) : []),
      ...(documents.status === "fulfilled" ? documentResults(documents.value, query) : []),
      ...(facets.status === "fulfilled" ? facetResults(facets.value, normalizedQuery) : []),
    ].slice(0, MAX_RESULTS);

    return Response.json({
      query,
      items,
      partial: [transactions, documents, facets].some((result) => result.status === "rejected"),
    }, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
