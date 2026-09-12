(() => {
  "use strict";

  const COOKIE = "financial_app_cr006_beta=1";
  const STORAGE_KEY = "financial_app_cr006_beta_state_v1";
  if (!document.cookie.split("; ").includes(COOKIE)) return;

  const params = new URL(window.location.href).searchParams;
  if (params.get("cr006_beta_reset") === "1") {
    localStorage.removeItem(STORAGE_KEY);
    params.delete("cr006_beta_reset");
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`;
    history.replaceState(null, "", cleanUrl);
  }

  const A = "10000000-0000-4000-8000-000000000001";
  const B = "10000000-0000-4000-8000-000000000002";
  const FOOD = "20000000-0000-4000-8000-000000000001";
  const HOME = "20000000-0000-4000-8000-000000000002";
  const TECH = "20000000-0000-4000-8000-000000000003";
  const LEISURE = "20000000-0000-4000-8000-000000000004";
  const SALARY = "20000000-0000-4000-8000-000000000005";
  const TRANSPORT = "20000000-0000-4000-8000-000000000006";
  const M_CARREFOUR = "30000000-0000-4000-8000-000000000001";
  const M_TELECOM = "30000000-0000-4000-8000-000000000002";
  const M_STREAMING = "30000000-0000-4000-8000-000000000003";
  const RULE_ID = "50000000-0000-4000-8000-000000000001";
  const DOC_ID = "93000000-0000-4000-8000-000000000093";
  const DOC_TX = "94000000-0000-4000-8000-000000000094";
  const FORECAST_ID = "81000000-0000-4000-8000-000000000081";
  const RECURRENCE_ID = "71000000-0000-4000-8000-000000000071";
  const now = "2026-09-12T05:40:00.000Z";

  const accounts = () => [
    { id: A, name: "Cuenta corriente Demo", institution: "Banco Demo", type: "checking", openingBalanceCents: 250000, currency: "EUR", lifecycle: "active", sortOrder: 0, createdAt: now, updatedAt: now },
    { id: B, name: "Cuenta ahorro Demo", institution: "Banco Demo", type: "savings", openingBalanceCents: 900000, currency: "EUR", lifecycle: "active", sortOrder: 1, createdAt: now, updatedAt: now },
  ];

  const categories = () => [
    { id: FOOD, name: "Alimentación", kind: "expense", parentCategoryId: null, iconKey: "cart", colorToken: "category.green", lifecycle: "active", sortOrder: 0, createdAt: now, updatedAt: now },
    { id: HOME, name: "Hogar", kind: "expense", parentCategoryId: null, iconKey: "home", colorToken: "category.blue", lifecycle: "active", sortOrder: 1, createdAt: now, updatedAt: now },
    { id: TECH, name: "Tecnología", kind: "expense", parentCategoryId: null, iconKey: "laptop", colorToken: "category.cyan", lifecycle: "active", sortOrder: 2, createdAt: now, updatedAt: now },
    { id: LEISURE, name: "Ocio", kind: "expense", parentCategoryId: null, iconKey: "sparkles", colorToken: "category.purple", lifecycle: "active", sortOrder: 3, createdAt: now, updatedAt: now },
    { id: TRANSPORT, name: "Transporte", kind: "expense", parentCategoryId: null, iconKey: "car", colorToken: "category.orange", lifecycle: "active", sortOrder: 4, createdAt: now, updatedAt: now },
    { id: SALARY, name: "Nómina", kind: "income", parentCategoryId: null, iconKey: "wallet", colorToken: "category.green", lifecycle: "active", sortOrder: 5, createdAt: now, updatedAt: now },
  ];

  function tx(id, bankDate, amountCents, accountId, concept, categoryId, merchantId, kind, extra = {}) {
    const account = accounts().find((entry) => entry.id === accountId);
    return {
      id,
      bankDate,
      amountCents,
      balanceAfterCents: extra.balanceAfterCents ?? null,
      account: { id: accountId, name: account?.name || "Cuenta Demo" },
      concept: { original: concept, processed: concept, effective: concept },
      merchant: merchantId ? { originalId: merchantId, originalName: null, effectiveId: merchantId, effectiveName: null } : { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
      category: categoryId ? { originalId: categoryId, originalName: null, effectiveId: categoryId, effectiveName: null } : { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
      kind: { original: kind, effective: kind },
      reviewState: extra.reviewState || "confirmed",
      duplicateState: extra.duplicateState || "none",
      transferPairId: extra.transferPairId || null,
      excludedFromAnalytics: Boolean(extra.excludedFromAnalytics),
      note: extra.note || "",
      source: { fileId: "CR006-DEMO", sheetId: "beta", rowKey: id },
      sourceRowKey: id,
      sourceRevision: "cr006-fictitious-v1",
      sourceFileId: "CR006-DEMO",
      sourceSheetId: "beta",
      updatedAt: now,
    };
  }

  function initialState() {
    const base = {
      version: 1,
      accounts: accounts(),
      categories: categories(),
      merchants: [
        { id: M_CARREFOUR, name: "Carrefour Demo", normalized_name: "carrefour demo", default_category_id: FOOD, lifecycle: "active", default_category_name: "Alimentación", default_category_kind: "expense", default_category_lifecycle: "active", alias_count: 1 },
        { id: M_TELECOM, name: "Telecom Demo", normalized_name: "telecom demo", default_category_id: TECH, lifecycle: "active", default_category_name: "Tecnología", default_category_kind: "expense", default_category_lifecycle: "active", alias_count: 0 },
        { id: M_STREAMING, name: "Streaming Demo", normalized_name: "streaming demo", default_category_id: LEISURE, lifecycle: "active", default_category_name: "Ocio", default_category_kind: "expense", default_category_lifecycle: "active", alias_count: 0 },
      ],
      aliases: [{ id: "40000000-0000-4000-8000-000000000001", merchant_id: M_CARREFOUR, alias: "TPV CARREFOUR DEMO", normalized_alias: "tpv carrefour demo" }],
      rules: [{ id: RULE_ID, name: "Supermercado mensual", status: "active", priority: 20, concept_contains: "carrefour", merchant_id: null, account_id: A, category_id: null, minimum_amount_cents: -20000, maximum_amount_cents: -100, target_category_id: FOOD, target_merchant_id: M_CARREFOUR, merchant_name: null, account_name: "Cuenta corriente Demo", category_name: null, target_category_name: "Alimentación", target_merchant_name: "Carrefour Demo" }],
      transactions: [],
      budgetTotalCents: 150000,
      budgetCategories: { [FOOD]: 45000, [HOME]: 65000, [TECH]: 20000, [LEISURE]: 20000 },
      recurrenceStatus: null,
      forecasts: [{ id: FORECAST_ID, date: "2026-09-18", accountId: A, accountName: "Cuenta corriente Demo", categoryId: HOME, categoryName: "Hogar", merchantId: null, merchantName: null, concept: "Seguro hogar Demo", amountCents: -7250, origin: "manual", confidence: "high", recurrenceId: null, budgetId: null, confirmedTransactionId: null, excluded: false, excludedReason: "", reconciliationNote: "", projectionKey: null, updatedAt: now, status: "planned", affectsProjection: true, projectionEffectCents: -7250, projectedBalanceAfterCents: 0, actual: null }],
      documents: [{ id: DOC_ID, type: "invoice", notes: "Documento ficticio CR-006", status: "pending_review", mimeType: "application/pdf", createdAt: now, sizeBytes: 1234, updatedAt: now, issuerName: "Proveedor Demo", totalCents: 5404, documentDate: "2026-09-02", storageProvider: "beta_local", associationCount: 0, originalFileName: "factura-demo.pdf", sourceModifiedAt: now, sourceDriveFileId: null }],
      associations: [],
      sourceSyncFailed: true,
    };
    base.transactions = [
      tx("61000000-0000-4000-8000-000000000001", "2026-09-05", -6534, A, "CARREFOUR DEMO", FOOD, M_CARREFOUR, "expense", { reviewState: "needs_review", duplicateState: "suspected", note: "Compra repetida legítima para revisar" }),
      tx("61000000-0000-4000-8000-000000000002", "2026-09-05", -6534, A, "CARREFOUR DEMO", FOOD, M_CARREFOUR, "expense", { duplicateState: "none" }),
      tx(DOC_TX, "2026-09-02", -5404, A, "COMUNIDAD DEMO", HOME, null, "expense"),
      tx("61000000-0000-4000-8000-000000000004", "2026-09-01", 210000, A, "NÓMINA DEMO", SALARY, null, "income"),
      tx("61000000-0000-4000-8000-000000000005", "2026-09-03", -3999, A, "TELECOM DEMO", TECH, M_TELECOM, "expense"),
      tx("61000000-0000-4000-8000-000000000006", "2026-09-06", -1299, A, "STREAMING DEMO", LEISURE, M_STREAMING, "expense"),
      tx("61000000-0000-4000-8000-000000000007", "2026-09-08", -4200, A, "GASOLINERA DEMO", TRANSPORT, null, "expense", { reviewState: "needs_review" }),
      tx("61000000-0000-4000-8000-000000000008", "2026-09-04", -25000, A, "TRASPASO A AHORRO", null, null, "transfer", { transferPairId: "61000000-0000-4000-8000-000000000009" }),
      tx("61000000-0000-4000-8000-000000000009", "2026-09-04", 25000, B, "TRASPASO DESDE CORRIENTE", null, null, "transfer", { transferPairId: "61000000-0000-4000-8000-000000000008" }),
      tx("62000000-0000-4000-8000-000000000001", "2026-08-01", 200000, A, "NÓMINA DEMO", SALARY, null, "income"),
      tx("62000000-0000-4000-8000-000000000002", "2026-08-07", -6900, A, "CARREFOUR DEMO", FOOD, M_CARREFOUR, "expense"),
      tx("62000000-0000-4000-8000-000000000003", "2026-08-10", -5800, A, "SUMINISTROS DEMO", HOME, null, "expense"),
      tx("62000000-0000-4000-8000-000000000004", "2026-08-15", -3299, A, "TELECOM DEMO", TECH, M_TELECOM, "expense"),
      tx("62000000-0000-4000-8000-000000000005", "2026-08-22", -1800, A, "CINE DEMO", LEISURE, null, "expense"),
      tx("63000000-0000-4000-8000-000000000001", "2026-07-01", 200000, A, "NÓMINA DEMO", SALARY, null, "income"),
      tx("63000000-0000-4000-8000-000000000002", "2026-07-09", -7400, A, "CARREFOUR DEMO", FOOD, M_CARREFOUR, "expense"),
      tx("63000000-0000-4000-8000-000000000003", "2026-07-20", -9500, A, "HOGAR DEMO", HOME, null, "expense"),
    ];
    return base;
  }

  function hydrateNames() {
    for (const item of state.transactions) {
      const cat = state.categories.find((entry) => entry.id === item.category?.effectiveId);
      if (cat) {
        item.category.originalName = item.category.originalName || cat.name;
        item.category.effectiveName = cat.name;
      }
      const mer = state.merchants.find((entry) => entry.id === item.merchant?.effectiveId);
      if (mer) {
        item.merchant.originalName = item.merchant.originalName || mer.name;
        item.merchant.effectiveName = mer.name;
      }
      const acc = state.accounts.find((entry) => entry.id === item.account.id);
      if (acc) item.account.name = acc.name;
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const fresh = initialState();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch {}
    return fresh;
  }

  let state = loadState();
  hydrateNames();

  function save() {
    hydrateNames();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function json(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...extraHeaders },
    });
  }

  function monthBounds(month) {
    const [year, value] = month.split("-").map(Number);
    const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
    return { dateFrom: `${month}-01`, dateTo: `${month}-${String(last).padStart(2, "0")}` };
  }

  function eligible(item) {
    return !item.excludedFromAnalytics && item.duplicateState !== "confirmed" && item.kind.effective !== "transfer";
  }

  function period(dateFrom, dateTo, accountId = null) {
    const rows = state.transactions.filter((item) => item.bankDate >= dateFrom && item.bankDate <= dateTo && (!accountId || item.account.id === accountId));
    const analytics = rows.filter(eligible);
    const incomeCents = analytics.filter((item) => item.kind.effective === "income" || item.amountCents > 0 && item.kind.effective !== "refund").reduce((sum, item) => sum + Math.max(0, item.amountCents), 0);
    const expenseCents = analytics.filter((item) => item.kind.effective === "expense" || item.kind.effective === "adjustment" || item.kind.effective === "refund" && item.amountCents < 0).reduce((sum, item) => sum + Math.abs(Math.min(0, item.amountCents)), 0);
    const operatingNetCents = incomeCents - expenseCents;
    const transferGrossCents = rows.filter((item) => item.kind.effective === "transfer").reduce((sum, item) => sum + Math.abs(item.amountCents), 0);
    const excludedRows = rows.filter((item) => !eligible(item)).length;
    return { dateFrom, dateTo, accountId, incomeCents, expenseCents, operatingNetCents, savingsCents: operatingNetCents, savingsRateBps: incomeCents ? Math.round((operatingNetCents / incomeCents) * 10000) : 0, transferGrossCents, quality: { includedRows: analytics.length, excludedRows, confirmedDuplicateRows: rows.filter((item) => item.duplicateState === "confirmed").length } };
  }

  function balances() {
    const items = [
      { accountId: A, accountName: state.accounts.find((a) => a.id === A)?.name || "Cuenta corriente Demo", institution: "Banco Demo", type: "checking", lifecycle: "active", currency: "EUR", balanceCents: 345080, balanceSource: "explicit", integrityDeltaCents: 0, reconciled: true },
      { accountId: B, accountName: state.accounts.find((a) => a.id === B)?.name || "Cuenta ahorro Demo", institution: "Banco Demo", type: "savings", lifecycle: "active", currency: "EUR", balanceCents: 1025000, balanceSource: "explicit", integrityDeltaCents: 0, reconciled: true },
    ];
    return { contractVersion: 1, asOfDate: "2026-09-12", totalBalanceCents: items.reduce((sum, item) => sum + item.balanceCents, 0), accounts: items, quality: { accounts: items.length, integrityDeltaAccounts: 0, explicitBalanceAccounts: items.length, reconstructedBalanceAccounts: 0 }, principles: { bankSource: "read_only", balanceSource: "financial_account_balances", getHasSideEffects: false } };
  }

  function monthly(dateFrom, dateTo, accountId = null) {
    const start = dateFrom.slice(0, 7);
    const end = dateTo.slice(0, 7);
    const months = [...new Set(state.transactions.map((item) => item.bankDate.slice(0, 7)).filter((month) => month >= start && month <= end))].sort();
    return { contractVersion: 1, dateFrom, dateTo, accountId, months: months.map((month) => { const bounds = monthBounds(month); return { month, ...period(bounds.dateFrom, bounds.dateTo, accountId) }; }), principles: { bankSource: "read_only", totals: "financial_period", getHasSideEffects: false } };
  }

  function financial(url) {
    const mode = url.searchParams.get("mode") || "snapshot";
    const dateFrom = url.searchParams.get("dateFrom") || "2026-09-01";
    const dateTo = url.searchParams.get("dateTo") || "2026-09-30";
    const accountId = url.searchParams.get("accountId") || null;
    if (mode === "balances") return balances();
    if (mode === "monthly") return monthly(dateFrom, dateTo, accountId);
    return { contractVersion: 1, period: period(dateFrom, dateTo, accountId), balances: balances(), monthly: monthly("2026-07-01", "2026-09-30", accountId).months, principles: { bankSource: "read_only", transfersExcludedFromOperating: true, confirmedDuplicatesExcluded: true, getHasSideEffects: false } };
  }

  function transactionFacets() {
    return { accounts: state.accounts.map((item) => ({ id: item.id, name: item.name, lifecycle: item.lifecycle })), categories: state.categories.map((item) => ({ id: item.id, name: item.name, kind: item.kind, lifecycle: item.lifecycle })), merchants: state.merchants.map((item) => ({ id: item.id, name: item.name, lifecycle: item.lifecycle })), kinds: ["income", "expense", "transfer", "refund", "adjustment"], reviewStates: ["confirmed", "pending", "needs_review"], duplicateStates: ["none", "suspected", "confirmed"] };
  }

  function transactionQuery(url) {
    let rows = [...state.transactions].sort((a, b) => b.bankDate.localeCompare(a.bankDate) || b.id.localeCompare(a.id));
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const accountId = url.searchParams.get("accountId");
    const categoryId = url.searchParams.get("categoryId");
    const merchantId = url.searchParams.get("merchantId");
    const kind = url.searchParams.get("kind");
    const reviewState = url.searchParams.get("reviewState");
    const duplicateState = url.searchParams.get("duplicateState");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const uncategorized = url.searchParams.get("uncategorized") === "true" || categoryId === "__uncategorized__";
    if (q) rows = rows.filter((item) => `${item.concept.effective} ${item.merchant.effectiveName || ""} ${item.category.effectiveName || ""}`.toLowerCase().includes(q));
    if (accountId) rows = rows.filter((item) => item.account.id === accountId);
    if (categoryId && categoryId !== "__uncategorized__") rows = rows.filter((item) => item.category.effectiveId === categoryId);
    if (merchantId) rows = rows.filter((item) => item.merchant.effectiveId === merchantId);
    if (kind) rows = rows.filter((item) => item.kind.effective === kind);
    if (reviewState) rows = rows.filter((item) => item.reviewState === reviewState);
    if (duplicateState) rows = rows.filter((item) => item.duplicateState === duplicateState);
    if (dateFrom) rows = rows.filter((item) => item.bankDate >= dateFrom);
    if (dateTo) rows = rows.filter((item) => item.bankDate <= dateTo);
    if (uncategorized) rows = rows.filter((item) => !item.category.effectiveId);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
    return { rows: rows.slice(0, limit), totalCount: rows.length, hasMore: rows.length > limit, nextCursor: rows.length > limit ? { bankDate: rows[limit - 1].bankDate, id: rows[limit - 1].id } : null };
  }

  function budgetSnapshot(month) {
    const bounds = monthBounds(month);
    const expenses = state.transactions.filter((item) => item.bankDate >= bounds.dateFrom && item.bankDate <= bounds.dateTo && eligible(item) && item.kind.effective === "expense");
    const actualTotal = expenses.reduce((sum, item) => sum + Math.abs(item.amountCents), 0);
    const budgetRows = Object.entries(state.budgetCategories).map(([categoryId, budgetCents]) => {
      const categoryName = state.categories.find((item) => item.id === categoryId)?.name || "Categoría";
      const actualExpenseCents = expenses.filter((item) => item.category.effectiveId === categoryId).reduce((sum, item) => sum + Math.abs(item.amountCents), 0);
      const remainingCents = budgetCents - actualExpenseCents;
      return { categoryId, categoryName, source: "manual", budgetCents, actualExpenseCents, remainingCents, usageBps: budgetCents ? Math.round(actualExpenseCents / budgetCents * 10000) : 0, status: remainingCents < 0 ? "over" : actualExpenseCents >= budgetCents * 0.8 ? "warning" : "on_track" };
    });
    const remainingCents = state.budgetTotalCents - actualTotal;
    return { contractVersion: 1, month, total: { source: "manual", budgetCents: state.budgetTotalCents, actualExpenseCents: actualTotal, remainingCents, usageBps: state.budgetTotalCents ? Math.round(actualTotal / state.budgetTotalCents * 10000) : 0, status: remainingCents < 0 ? "over" : actualTotal >= state.budgetTotalCents * 0.8 ? "warning" : "on_track" }, categories: budgetRows, principles: { bankSource: "read_only", actuals: "effective_transaction_query", transfersExcluded: true, confirmedDuplicatesExcluded: true, manualOverridesAutomatic: true, getHasSideEffects: false } };
  }

  function recurrenceSnapshot() {
    return { contractVersion: 1, month: "2026-09", candidateCount: 2, candidates: [{ candidateKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", concept: "CARREFOUR DEMO", merchantName: "Carrefour Demo", categoryName: "Alimentación", amountCents: -6500, cadence: "monthly", confidence: "high", existingRecurrenceId: state.recurrenceStatus ? RECURRENCE_ID : null, existingStatus: state.recurrenceStatus }, { candidateKey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", concept: "NÓMINA DEMO", merchantName: null, categoryName: "Nómina", amountCents: 210000, cadence: "monthly", confidence: "high", existingRecurrenceId: null, existingStatus: null }], recurrences: state.recurrenceStatus ? [{ id: RECURRENCE_ID, candidateKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", label: "Compra mensual Demo", status: state.recurrenceStatus, cadence: "monthly", amountCents: -6500, nextDate: "2026-10-05", updatedAt: now }] : [], principles: { bankSource: "read_only", confirmedOnlyAffectsForecast: true, getHasSideEffects: false } };
  }

  function forecastSnapshot() {
    const openingBalanceCents = balances().totalBalanceCents;
    const active = state.forecasts.filter((item) => !item.excluded && !item.confirmedTransactionId);
    const projectedIncomeCents = active.filter((item) => item.amountCents > 0).reduce((sum, item) => sum + item.amountCents, 0);
    const projectedExpenseCents = active.filter((item) => item.amountCents < 0).reduce((sum, item) => sum + Math.abs(item.amountCents), 0);
    const projectedNetCents = projectedIncomeCents - projectedExpenseCents;
    let running = openingBalanceCents;
    const items = state.forecasts.map((item) => { if (item.affectsProjection) running += item.amountCents; return { ...item, projectedBalanceAfterCents: running }; });
    return { contractVersion: 1, period: { dateFrom: "2026-09-12", dateTo: "2026-12-11", accountId: null }, summary: { openingBalanceCents, projectedIncomeCents, projectedExpenseCents, projectedNetCents, projectedClosingBalanceCents: openingBalanceCents + projectedNetCents, plannedItems: items.filter((item) => item.status === "planned").length, excludedItems: items.filter((item) => item.status === "excluded").length, confirmedItems: items.filter((item) => item.status === "confirmed").length }, items, budgetContext: [{ month: "2026-09", budgetCents: state.budgetTotalCents, actualExpenseCents: budgetSnapshot("2026-09").total.actualExpenseCents, remainingCents: budgetSnapshot("2026-09").total.remainingCents, status: budgetSnapshot("2026-09").total.status }], balanceContext: balances(), principles: { bankSource: "read_only", openingBalanceSource: "financial_account_balances", recurrenceSource: "active_recurrences_only", budgetsCreateDatedItems: false, excludedItemsAffectCashFlow: false, confirmedItemsAffectCashFlow: false, getHasSideEffects: false } };
  }

  function analysis(month) {
    const currentBounds = monthBounds(month);
    const current = period(currentBounds.dateFrom, currentBounds.dateTo);
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const previousMonth = d.toISOString().slice(0, 7);
    const previousBounds = monthBounds(previousMonth);
    const previous = period(previousBounds.dateFrom, previousBounds.dateTo);
    const expenses = state.transactions.filter((item) => item.bankDate >= currentBounds.dateFrom && item.bankDate <= currentBounds.dateTo && eligible(item) && item.kind.effective === "expense");
    const buildDrivers = (key) => {
      const groups = new Map();
      for (const item of expenses) {
        const object = item[key];
        const id = object.effectiveId || null;
        const name = object.effectiveName || (key === "category" ? "Sin categoría" : "Sin comercio");
        const groupKey = id || `null-${name}`;
        const previousGroup = groups.get(groupKey) || { id, name, expenseCents: 0, rows: 0 };
        previousGroup.expenseCents += Math.abs(item.amountCents);
        previousGroup.rows += 1;
        groups.set(groupKey, previousGroup);
      }
      return [...groups.values()].sort((a, b) => b.expenseCents - a.expenseCents).map((item) => ({ ...item, shareBps: current.expenseCents ? Math.round(item.expenseCents / current.expenseCents * 10000) : 0, href: item.id ? `/transactions?dateFrom=${currentBounds.dateFrom}&dateTo=${currentBounds.dateTo}&kind=expense&${key}Id=${item.id}` : key === "category" ? `/transactions?dateFrom=${currentBounds.dateFrom}&dateTo=${currentBounds.dateTo}&kind=expense&categoryId=__uncategorized__` : null }));
    };
    const change = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 10000) : null;
    return { contractVersion: 1, month, current, previous, comparison: { incomeDeltaCents: current.incomeCents - previous.incomeCents, incomeChangeBps: change(current.incomeCents, previous.incomeCents), expenseDeltaCents: current.expenseCents - previous.expenseCents, expenseChangeBps: change(current.expenseCents, previous.expenseCents), netDeltaCents: current.operatingNetCents - previous.operatingNetCents, netChangeBps: change(current.operatingNetCents, previous.operatingNetCents) }, categoryDrivers: buildDrivers("category"), merchantDrivers: buildDrivers("merchant"), quality: { expenseRows: expenses.length, excludedRows: state.transactions.filter((item) => item.bankDate.startsWith(month) && item.excludedFromAnalytics).length, confirmedDuplicateRows: state.transactions.filter((item) => item.bankDate.startsWith(month) && item.duplicateState === "confirmed").length, reconciled: true }, principles: { bankSource: "read_only", totals: "financial_period", drivers: "effective_transaction_query" } };
  }

  function documentList() {
    return { contractVersion: 1, items: state.documents.map((item) => ({ ...item, associationCount: state.associations.filter((assoc) => assoc.documentId === item.id).length })), total: state.documents.length, limit: 50, offset: 0, principles: { bankSource: "read_only", ocrEnabled: true, getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true } };
  }

  function documentDetail(id) {
    return { contractVersion: 1, document: state.documents.find((item) => item.id === id) || state.documents[0], associations: state.associations.filter((assoc) => assoc.documentId === id), principles: { bankSource: "read_only", ocrEnabled: true, getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true } };
  }

  async function readBody(input, init) {
    try {
      if (init && typeof init.body === "string" && init.body) return JSON.parse(init.body);
      if (input instanceof Request) return await input.clone().json();
    } catch {}
    return {};
  }

  async function handleApi(url, method, body) {
    const path = url.pathname;
    if (path === "/api/financial" && method === "GET") return json(financial(url));
    if (path === "/api/analysis" && method === "GET") return json(analysis(url.searchParams.get("month") || "2026-09"));

    if (path === "/api/transactions") {
      if (method === "GET") {
        const mode = url.searchParams.get("mode");
        if (mode === "facets") return json(transactionFacets());
        if (mode === "duplicate-group") {
          const id = url.searchParams.get("transactionId");
          const selected = state.transactions.find((item) => item.id === id);
          const rows = selected ? state.transactions.filter((item) => item.bankDate === selected.bankDate && item.amountCents === selected.amountCents) : [];
          return json({ transactionId: id, rows, totalCount: rows.length });
        }
        if (mode === "transfer-candidates") {
          const id = url.searchParams.get("transactionId");
          const selected = state.transactions.find((item) => item.id === id);
          const candidates = selected ? state.transactions.filter((item) => item.id !== id && item.kind.effective === "transfer" && item.amountCents === -selected.amountCents) : [];
          return json({ transactionId: id, candidates });
        }
        return json(transactionQuery(url));
      }
      if (method === "PATCH") {
        const ids = Array.isArray(body.transactionIds) ? body.transactionIds : [];
        const patch = body.patch || {};
        let changed = 0;
        for (const item of state.transactions) {
          if (!ids.includes(item.id)) continue;
          if (typeof patch.concept === "string") item.concept.effective = patch.concept;
          if ("categoryId" in patch) { item.category.effectiveId = patch.categoryMode === "original" ? item.category.originalId : patch.categoryId; item.category.effectiveName = state.categories.find((entry) => entry.id === item.category.effectiveId)?.name || null; }
          if ("merchantId" in patch) { item.merchant.effectiveId = patch.merchantMode === "original" ? item.merchant.originalId : patch.merchantId; item.merchant.effectiveName = state.merchants.find((entry) => entry.id === item.merchant.effectiveId)?.name || null; }
          if (typeof patch.kind === "string") item.kind.effective = patch.kind;
          if (typeof patch.reviewState === "string") item.reviewState = patch.reviewState;
          if (typeof patch.excludedFromAnalytics === "boolean") item.excludedFromAnalytics = patch.excludedFromAnalytics;
          if (typeof patch.note === "string") item.note = patch.note;
          changed += 1;
        }
        save();
        return json({ result: { requestedTransactions: ids.length, changedTransactions: changed, auditChanges: changed } });
      }
      if (method === "POST") {
        const item = state.transactions.find((entry) => entry.id === body.transactionId);
        if (body.action === "duplicate-review" && item) { item.duplicateState = body.decision === "confirmed" ? "confirmed" : "none"; item.reviewState = "confirmed"; save(); return json({ result: { changed: true, transactionId: item.id, duplicateState: item.duplicateState } }); }
        if (body.action === "transfer-pair" && item) { const pair = state.transactions.find((entry) => entry.id === body.pairId); item.transferPairId = body.pairId; if (pair) pair.transferPairId = item.id; save(); return json({ result: { changed: true, transactionId: item.id, pairId: body.pairId } }); }
        if (body.action === "transfer-unpair" && item) { const old = item.transferPairId; item.transferPairId = null; const pair = state.transactions.find((entry) => entry.id === old); if (pair) pair.transferPairId = null; save(); return json({ result: { changed: true, transactionId: item.id } }); }
      }
    }

    if (path === "/api/configuration") {
      if (method === "GET") return json({ accounts: state.accounts, categories: state.categories });
      if (method === "POST") {
        if (body.operation === "account.create") { const account = { id: crypto.randomUUID(), ...body.draft, currency: body.draft?.currency || "EUR", lifecycle: "active", sortOrder: state.accounts.length, createdAt: now, updatedAt: now }; state.accounts.push(account); save(); return json({ account }, 201); }
        if (body.operation === "account.update") { const account = state.accounts.find((item) => item.id === body.id); Object.assign(account || {}, body.draft || {}, { updatedAt: now }); save(); return json({ account }); }
        if (body.operation === "account.archive") { const account = state.accounts.find((item) => item.id === body.id); if (account) account.lifecycle = body.archived ? "archived" : "active"; save(); return json({ account }); }
        if (body.operation === "category.create") { const item = { id: crypto.randomUUID(), ...body.draft, lifecycle: "active", sortOrder: state.categories.length, createdAt: now, updatedAt: now }; state.categories.push(item); save(); return json({ category: item }, 201); }
        if (body.operation === "category.update") { const item = state.categories.find((entry) => entry.id === body.id); Object.assign(item || {}, body.draft || {}, { updatedAt: now }); save(); return json({ category: item }); }
        if (body.operation === "category.archive") { const item = state.categories.find((entry) => entry.id === body.id); if (item) item.lifecycle = body.archived ? "archived" : "active"; save(); return json({ category: item }); }
        if (body.operation === "category.merge") { for (const item of state.transactions) if (item.category.effectiveId === body.sourceCategoryId) item.category.effectiveId = body.targetCategoryId; state.categories = state.categories.filter((item) => item.id !== body.sourceCategoryId); save(); return json({ ok: true }); }
        if (body.operation === "account.reorder" || body.operation === "category.reorder") return json({ ok: true });
      }
    }

    if (path === "/api/merchants") {
      if (method === "GET") return json({ merchants: state.merchants, aliases: state.aliases });
      if (body.operation === "merchant.resolve") return json({ merchant: body.label ? state.merchants[0] : null });
      if (body.operation === "merchant.save") {
        const existing = state.merchants.find((item) => item.id === body.id) || state.merchants.find((item) => item.name.toLowerCase() === String(body.name || body.draft?.name || "").toLowerCase());
        if (existing) return json({ merchant: existing });
        const merchant = { id: crypto.randomUUID(), name: body.name || body.draft?.name || "Comercio Demo", normalized_name: String(body.name || body.draft?.name || "comercio demo").toLowerCase(), default_category_id: body.defaultCategoryId || body.draft?.defaultCategoryId || null, lifecycle: "active", default_category_name: null, default_category_kind: null, default_category_lifecycle: null, alias_count: 0 };
        state.merchants.push(merchant); save(); return json({ merchant });
      }
      return json({ ok: true, deleted: true });
    }

    if (path === "/api/rules") {
      const payload = { rules: state.rules, accounts: state.accounts.map(({ id, name, lifecycle }) => ({ id, name, lifecycle })), categories: state.categories.map(({ id, name, kind, lifecycle }) => ({ id, name, kind, lifecycle })), merchants: state.merchants.map(({ id, name, lifecycle }) => ({ id, name, lifecycle })) };
      if (method === "GET") return json(payload);
      if (body.operation === "rule.save") return json({ rule: state.rules[0] });
      if (body.operation === "rule.apply_all") return json({ result: { evaluated: state.transactions.length, matched: 4, merchantChanged: 2, categoryChanged: 3, limit: 10000 } });
      if (body.operation === "rule.evaluate") return json({ result: { transactionId: body.transactionId, selectedRuleId: RULE_ID, selectedRuleName: "Supermercado mensual", selectedRulePriority: 20, merchantLocked: false, categoryLocked: false } });
      return json({ ok: true });
    }

    if (path === "/api/budgets") {
      const month = url.searchParams.get("month") || body.month || "2026-09";
      if (method === "GET") return json(budgetSnapshot(month));
      if (method === "PATCH") { if (body.scope === "total" || body.action === "total" || body.type === "total") state.budgetTotalCents = Number(body.amountCents ?? body.budgetCents ?? state.budgetTotalCents); if (body.categoryId) state.budgetCategories[body.categoryId] = Number(body.amountCents ?? body.budgetCents ?? state.budgetCategories[body.categoryId] ?? 0); save(); return json(budgetSnapshot(month)); }
      if (method === "POST") return json(budgetSnapshot(month));
    }

    if (path === "/api/recurrences") {
      if (method === "GET") return json(recurrenceSnapshot());
      if (method === "POST") { state.recurrenceStatus = "active"; save(); return json({ id: RECURRENCE_ID, status: "active" }); }
      if (method === "PATCH") { state.recurrenceStatus = body.status || "paused"; save(); return json({ id: body.id || RECURRENCE_ID, status: state.recurrenceStatus }); }
    }

    if (path === "/api/forecast") {
      if (method === "GET" && url.searchParams.has("itemId")) return json({ forecastItemId: url.searchParams.get("itemId"), forecastDate: "2026-09-18", forecastAmountCents: -7250, days: 7, candidates: [{ transactionId: DOC_TX, date: "2026-09-02", amountCents: -5404, differenceCents: 1846, dayDifference: 16, accountId: A, categoryId: HOME, merchantId: null, concept: "COMUNIDAD DEMO" }] });
      if (method === "GET") return json(forecastSnapshot());
      if (method === "POST" && body.action === "refresh") return json({ generated: 0, superseded: 0 });
      if (method === "POST" && body.action === "manual") { const item = { ...state.forecasts[0], id: crypto.randomUUID(), date: body.date, concept: body.concept, amountCents: Number(body.amountCents), confidence: body.confidence || "high", updatedAt: new Date().toISOString(), status: "planned", excluded: false, excludedReason: "", confirmedTransactionId: null, affectsProjection: true }; state.forecasts.push(item); save(); return json({ id: item.id, origin: "manual" }); }
      if (method === "PATCH" && body.action === "exclude") { const item = state.forecasts.find((entry) => entry.id === body.id); if (item) { item.excluded = Boolean(body.excluded); item.excludedReason = body.reason || ""; item.status = item.excluded ? "excluded" : "planned"; item.affectsProjection = !item.excluded; item.updatedAt = new Date().toISOString(); } save(); return json({ id: body.id, excluded: Boolean(body.excluded) }); }
      if (method === "PATCH" && body.action === "reconcile") { const item = state.forecasts.find((entry) => entry.id === body.id); if (item) { item.confirmedTransactionId = body.transactionId || null; item.status = body.transactionId ? "confirmed" : "planned"; item.affectsProjection = !body.transactionId; item.updatedAt = new Date().toISOString(); } save(); return json({ id: body.id, confirmed_transaction_id: body.transactionId || null }); }
    }

    if (path === "/api/documents/ocr" && method === "GET") {
      const id = url.searchParams.get("id") || DOC_ID;
      return json({ contractVersion: 1, documentId: id, status: "ready", source: "beta_fictitious", extractor: "cr006-local-fixture", extractedAt: now, confidence: 1, plainText: "FACTURA DEMO\nPROVEEDOR DEMO\nTOTAL 54,04 EUR", warnings: ["Contenido ficticio de beta CR-006"], principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true }, pages: [{ pageNumber: 1, plainText: "FACTURA DEMO\nPROVEEDOR DEMO\nTOTAL 54,04 EUR", layoutText: "             FACTURA DEMO\nPROVEEDOR DEMO\n                         TOTAL     54,04 EUR", lines: [{ id: "p1-l1", text: "FACTURA DEMO", confidence: 1, alignment: "center", words: [] }, { id: "p1-l2", text: "PROVEEDOR DEMO", confidence: 1, alignment: "left", words: [] }, { id: "p1-l3", text: "TOTAL 54,04 EUR", confidence: 1, alignment: "right", words: [] }] }] });
    }

    if (path === "/api/documents") {
      if (method === "GET") {
        const id = url.searchParams.get("id");
        const mode = url.searchParams.get("mode");
        if (mode === "candidates") return json({ contractVersion: 1, documentId: id || DOC_ID, ready: true, reason: null, days: 7, amountToleranceCents: 200, principles: { bankSource: "read_only", requiresConfirmation: true, suggestionsPersisted: false }, candidates: [{ transactionId: DOC_TX, date: "2026-09-02", concept: "COMUNIDAD DEMO", accountId: A, accountName: "Cuenta corriente Demo", amountCents: -5404, categoryId: HOME, merchantId: null, merchantName: null, confidence: 1, dayDifference: 0, amountDifferenceCents: 0, effectiveKind: "expense" }] });
        if (mode === "open") return json({ provider: "beta_local", url: "data:text/plain,Documento%20ficticio%20CR-006", expiresInSeconds: 300 });
        if (id) return json(documentDetail(id));
        return json(documentList());
      }
      if (method === "PATCH") {
        if (body.action === "metadata") { const item = state.documents.find((entry) => entry.id === body.id); if (item) Object.assign(item, { type: body.type, documentDate: body.documentDate, issuerName: body.issuerName, totalCents: body.totalCents, notes: body.notes, updatedAt: new Date().toISOString() }); save(); return json(documentDetail(body.id)); }
        if (body.action === "associate") { state.associations = state.associations.filter((entry) => entry.documentId !== body.documentId); state.associations.push({ id: crypto.randomUUID(), documentId: body.documentId, date: "2026-09-02", method: body.method, concept: "COMUNIDAD DEMO", accountId: A, accountName: "Cuenta corriente Demo", confirmed: true, amountCents: -5404, transactionId: body.transactionId, categoryId: HOME, merchantId: null, merchantName: null, effectiveKind: "expense", confidence: 1 }); save(); return json(documentDetail(body.documentId)); }
        if (body.action === "unassociate") { state.associations = state.associations.filter((entry) => entry.documentId !== body.documentId); save(); return json(documentDetail(body.documentId)); }
        if (body.action === "status") { const item = state.documents.find((entry) => entry.id === body.id); if (item) item.status = body.status; save(); return json(documentDetail(body.id)); }
      }
      if (method === "POST" && body.action === "upload_sign") return json({ bucket: "cr006-beta-local", path: `uploads/${crypto.randomUUID()}`, token: "local-beta-token", signedUrl: `${window.location.origin}/__cr006_beta_upload__/local`, maxFileBytes: 15728640 });
      if (method === "POST" && body.action === "upload_finalize") { const item = { id: crypto.randomUUID(), type: body.type || "receipt", notes: "Carga ficticia local", status: "pending_review", mimeType: body.mimeType || "application/pdf", createdAt: new Date().toISOString(), sizeBytes: body.sizeBytes || 0, updatedAt: new Date().toISOString(), issuerName: null, totalCents: null, documentDate: null, storageProvider: "beta_local", associationCount: 0, originalFileName: body.originalFileName || "archivo-demo.pdf", sourceModifiedAt: new Date().toISOString(), sourceDriveFileId: null }; state.documents.unshift(item); save(); return json(documentDetail(item.id)); }
    }

    if (path === "/api/source/google/status") {
      if (method === "DELETE") return json({ disconnected: true });
      return json({ configured: true, connection: { connected: true, accountEmail: "beta@financial-app.test", sourceFileName: "Fuente bancaria ficticia CR-006", connectedAt: now, lastVerifiedAt: now, readonly: true } });
    }
    if (path === "/api/source/google/sync") {
      if (method === "POST") { state.sourceSyncFailed = false; save(); return json({ syncRunId: "10000000-0000-4000-8000-000000000099", status: "success", rowsSeen: state.transactions.length, rowsInserted: 0, rowsRevised: 0, rowsSkipped: state.transactions.length, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, cursorsAdvanced: 2, sourceRevision: "cr006-fictitious-v1" }); }
      return json({ run: state.sourceSyncFailed ? { id: "10000000-0000-4000-8000-000000000077", sourceFileId: "CR006-DEMO", sourceRevision: "cr006-fictitious-v1", status: "failed", startedAt: now, finishedAt: now, rowsSeen: state.transactions.length, rowsInserted: 0, rowsRevised: 0, rowsSkipped: state.transactions.length, rowsFailed: 1, duplicatesDetected: 0, warningsCount: 2, errorCode: "cr006_fictitious_warning", errorMessage: "Incidencia ficticia para probar Para revisar" } : { id: "10000000-0000-4000-8000-000000000099", sourceFileId: "CR006-DEMO", sourceRevision: "cr006-fictitious-v1", status: "success", startedAt: now, finishedAt: now, rowsSeen: state.transactions.length, rowsInserted: 0, rowsRevised: 0, rowsSkipped: state.transactions.length, rowsFailed: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null, errorMessage: null }, cursors: [{ sourceFileId: "CR006-DEMO", sourceSheetId: "beta-current", sourceRevision: "cr006-fictitious-v1", lastSourceRowKey: "BETA-001", lastSuccessfulRunId: "10000000-0000-4000-8000-000000000099", updatedAt: now }] });
    }
    if (path === "/api/source/google/preflight") return json({ sourceFileId: "CR006-DEMO", sourceRevision: "cr006-fictitious-v1", schemaFingerprint: "f".repeat(64), totalAuthoritativeRows: state.transactions.length, accounts: state.accounts.map((item) => ({ accountExternalKey: item.name, accountName: item.name, accountType: item.type, lifecycle: item.lifecycle, authoritativeRows: state.transactions.filter((entry) => entry.account.id === item.id).length, openingBalanceCents: item.openingBalanceCents, newestBankDate: "2026-09-08", oldestBankDate: "2026-07-01", latestBalanceAfterCents: balances().accounts.find((entry) => entry.accountId === item.id)?.balanceCents ?? null })), cursors: [{ sourceSheetId: "beta-current", sheetTitle: "Cuenta corriente Demo", authoritativeRows: state.transactions.length, lastSourceRowKey: "BETA-001" }] });
    if (path === "/api/health/source-runtime") return json({ status: "ok", compatible: true, capabilities: { contractVersion: 2, sourceAccountLifecycle: true, canonicalProductSelection: true } });
    if (path.startsWith("/api/health/")) return json({ status: "ok", passed: 40, total: 40, verified: true, clean: true, residue: { accounts: 0, mappings: 0, sources: 0, transactions: 0, cursors: 0 } });
    if (path === "/api/build") return json({ environment: "cr006-beta", commit: "fictitious-runtime", production: false });
    return json({ error: "cr006_beta_endpoint_not_implemented", path, method }, 503);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function cr006BetaFetch(input, init) {
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (target.origin === window.location.origin && target.pathname.startsWith("/__cr006_beta_upload__/")) return new Response("ok", { status: 200, headers: { "cache-control": "no-store" } });
    if (target.origin === window.location.origin && target.pathname.startsWith("/api/")) { const body = await readBody(input, init); return handleApi(target, method, body); }
    if (/\.supabase\.co$/i.test(target.hostname) || /(^|\.)googleapis\.com$/i.test(target.hostname) || /(^|\.)googleusercontent\.com$/i.test(target.hostname)) return json({ error: "cr006_beta_external_persistence_blocked", host: target.hostname }, 451);
    return originalFetch(input, init);
  };

  window.__FINANCIAL_APP_CR006_BETA__ = Object.freeze({ active: true, storage: "localStorage", bankSource: "read_only", dataset: "fictitious", externalPersistence: "blocked" });

  function addBanner() {
    if (document.getElementById("cr006-beta-banner")) return;
    const banner = document.createElement("div");
    banner.id = "cr006-beta-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = "CR-006 · Beta humana · datos 100 % ficticios · cambios guardados sólo en este navegador";
    Object.assign(banner.style, { position: "sticky", top: "0", zIndex: "2147483647", padding: "10px 16px", background: "CanvasText", color: "Canvas", font: "600 14px/1.4 system-ui, sans-serif", textAlign: "center", borderBottom: "1px solid currentColor" });
    document.body.prepend(banner);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBanner, { once: true });
  else addBanner();
})();
