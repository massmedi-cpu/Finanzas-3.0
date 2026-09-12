(() => {
  "use strict";

  const COOKIE = "financial_app_cr006_beta=1";
  if (!document.cookie.split("; ").includes(COOKIE)) return;
  if (!window.__FINANCIAL_APP_CR006_BETA__) return;

  const betaFetch = window.fetch.bind(window);

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  }

  function normalizeReviewState(value) {
    if (value && typeof value === "object") {
      return {
        original: value.original || value.effective || "confirmed",
        effective: value.effective || value.original || "confirmed",
      };
    }
    const state = typeof value === "string" ? value : "confirmed";
    return { original: state, effective: state };
  }

  function normalizeTransactionRow(row) {
    const source = row?.source || {};
    const id = String(row?.id || crypto.randomUUID());
    const reviewState = normalizeReviewState(row?.reviewState);
    const userNote = row?.userNote ?? row?.note ?? null;
    const overriddenFields = Array.isArray(row?.overriddenFields) ? row.overriddenFields : [];

    return {
      ...row,
      id,
      reviewState,
      userNote,
      hasUserOverride: Boolean(row?.hasUserOverride || overriddenFields.length),
      overriddenFields,
      source: {
        sourceRecordId: source.sourceRecordId || `cr006-record-${id}`,
        sourceRowIdentity: source.sourceRowIdentity || `cr006::beta::${id}`,
        sourceFileId: source.sourceFileId || source.fileId || row?.sourceFileId || "CR006-DEMO",
        sourceSheetId: source.sourceSheetId || source.sheetId || row?.sourceSheetId || "beta",
        sourceRowKey: source.sourceRowKey || source.rowKey || row?.sourceRowKey || id,
        sourceFingerprint: source.sourceFingerprint || "0".repeat(64),
        importedAt: source.importedAt || row?.updatedAt || "2026-09-12T05:40:00.000Z",
      },
    };
  }

  function normalizeFacets(payload) {
    return {
      accounts: (payload?.accounts || []).map((item, index) => ({
        id: item.id,
        name: item.name,
        lifecycle: item.lifecycle || "active",
        sort_order: Number(item.sort_order ?? item.sortOrder ?? index),
      })),
      categories: (payload?.categories || []).map((item, index) => ({
        id: item.id,
        name: item.name,
        kind: item.kind || "expense",
        lifecycle: item.lifecycle || "active",
        parent_category_id: item.parent_category_id ?? item.parentCategoryId ?? null,
        sort_order: Number(item.sort_order ?? item.sortOrder ?? index),
      })),
      merchants: (payload?.merchants || []).map((item) => ({
        id: item.id,
        name: item.name,
        lifecycle: item.lifecycle || "active",
      })),
    };
  }

  function normalizeDuplicateGroup(payload) {
    return {
      rows: (payload?.rows || []).map((row) => ({
        id: row.id,
        account_id: row.account_id || row.account?.id || null,
        account_name: row.account_name || row.account?.name || "Cuenta Demo",
        bank_date: row.bank_date || row.bankDate,
        concept_normalized: row.concept_normalized || row.concept?.effective || row.concept?.processed || "Movimiento Demo",
        amount_cents: Number(row.amount_cents ?? row.amountCents ?? 0),
        duplicate_state: row.duplicate_state || row.duplicateState || "suspected",
        decision: row.decision || null,
        review_current: Boolean(row.review_current),
      })),
    };
  }

  function normalizeTransferCandidates(payload) {
    const source = payload?.rows || payload?.candidates || [];
    return {
      rows: source.map((row) => ({
        id: row.id,
        account_id: row.account_id || row.account?.id || null,
        account_name: row.account_name || row.account?.name || "Cuenta Demo",
        bank_date: row.bank_date || row.bankDate,
        concept_normalized: row.concept_normalized || row.concept?.effective || "Transferencia Demo",
        amount_cents: Number(row.amount_cents ?? row.amountCents ?? 0),
        transfer_pair_id: row.transfer_pair_id ?? row.transferPairId ?? null,
        day_gap: Number(row.day_gap ?? 0),
      })),
      dayWindow: Number(payload?.dayWindow ?? 3),
    };
  }

  async function requestBody(input, init) {
    try {
      if (typeof init?.body === "string") return JSON.parse(init.body);
      if (input instanceof Request) return await input.clone().json();
    } catch {}
    return null;
  }

  window.fetch = async function cr006BetaContractShimFetch(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    let forwardedInput = input;
    let forwardedInit = init;

    // El cliente real de Presupuestos persiste manualAmountCents; el fixture beta
    // original usaba amountCents. Traducimos sólo dentro de la beta aislada.
    if (url.origin === window.location.origin && url.pathname === "/api/budgets" && method === "PATCH") {
      const body = await requestBody(input, init);
      if (body && Object.prototype.hasOwnProperty.call(body, "manualAmountCents")) {
        const translated = { ...body, amountCents: body.manualAmountCents };
        forwardedInput = url.toString();
        forwardedInit = {
          ...(init || {}),
          method: "PATCH",
          headers: { ...(init?.headers || {}), "content-type": "application/json" },
          body: JSON.stringify(translated),
        };
      }
    }

    const response = await betaFetch(forwardedInput, forwardedInit);
    if (url.origin !== window.location.origin || !response.ok) return response;

    if (url.pathname === "/api/transactions" && method === "GET") {
      const payload = await response.clone().json().catch(() => null);
      if (!payload) return response;
      const mode = url.searchParams.get("mode");
      if (mode === "facets") return json(normalizeFacets(payload), response.status);
      if (mode === "duplicate-group") return json(normalizeDuplicateGroup(payload), response.status);
      if (mode === "transfer-candidates") return json(normalizeTransferCandidates(payload), response.status);
      return json({
        rows: (payload.rows || []).map(normalizeTransactionRow),
        totalCount: Number(payload.totalCount || 0),
        hasMore: Boolean(payload.hasMore),
        nextCursor: payload.nextCursor || null,
      }, response.status);
    }

    return response;
  };
})();
