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

  function normalizeBalances(input) {
    const source = input?.accounts || [];
    const accounts = source.map((item, index) => {
      const id = item.id || item.accountId;
      const name = item.name || item.accountName || `Cuenta Demo ${index + 1}`;
      const balanceCents = Number(item.balanceCents || 0);
      return {
        id,
        name,
        type: item.type || "checking",
        currency: item.currency || "EUR",
        lifecycle: item.lifecycle || "active",
        openingBalanceCents: 0,
        balanceCents,
        balanceSource: "bank_explicit",
        explicitBalanceCents: balanceCents,
        explicitBalanceDate: input?.asOfDate || "2026-09-12",
        explicitSourceRowKey: `CR006-${index + 1}`,
        reconstructedBalanceCents: balanceCents,
        reconstructionDeltaCents: 0,
      };
    });
    const totalBalanceCents = accounts.reduce((sum, item) => sum + item.balanceCents, 0);
    return {
      asOfDate: input?.asOfDate || "2026-09-12",
      includeArchived: false,
      accountId: null,
      totalBalanceCents,
      activeBalanceCents: totalBalanceCents,
      quality: {
        accounts: accounts.length,
        explicitBalanceAccounts: accounts.length,
        reconstructedBalanceAccounts: 0,
        integrityDeltaAccounts: 0,
      },
      accounts,
    };
  }

  function normalizePeriod(input) {
    const transferGrossCents = Number(input?.transferGrossCents || input?.transfers?.grossCents || 0);
    const scopedRows = Number(input?.quality?.scopedRows || input?.quality?.includedRows || 0);
    const includedRows = Number(input?.quality?.includedRows || scopedRows);
    const suspectedDuplicateRows = Number(input?.quality?.suspectedDuplicateRows || 0);
    const confirmedDuplicateRows = Number(input?.quality?.confirmedDuplicateRows || 0);
    return {
      ...input,
      refundCents: Number(input?.refundCents || 0),
      adjustmentCents: Number(input?.adjustmentCents || 0),
      transfers: input?.transfers || {
        rows: transferGrossCents ? 2 : 0,
        pairedRows: transferGrossCents ? 2 : 0,
        unpairedRows: 0,
        pairedPairs: transferGrossCents ? 1 : 0,
        netCents: 0,
        grossCents: transferGrossCents,
      },
      quality: {
        scopedRows,
        includedRows,
        manuallyExcludedRows: Number(input?.quality?.manuallyExcludedRows || input?.quality?.excludedRows || 0),
        confirmedDuplicateRows,
        suspectedDuplicateRows,
        signMismatchRows: 0,
      },
    };
  }

  function normalizeMonthly(input, dateFrom, dateTo) {
    const source = Array.isArray(input?.rows) ? input.rows : Array.isArray(input?.months) ? input.months : Array.isArray(input) ? input : [];
    const rows = source.map((item) => {
      const month = item.month || item.monthStart?.slice(0, 7) || item.dateFrom?.slice(0, 7) || "2026-09";
      const p = normalizePeriod(item);
      return {
        monthStart: `${month}-01`,
        rows: p.quality.scopedRows,
        incomeCents: Number(p.incomeCents || 0),
        expenseCents: Number(p.expenseCents || 0),
        refundCents: Number(p.refundCents || 0),
        adjustmentCents: Number(p.adjustmentCents || 0),
        operatingNetCents: Number(p.operatingNetCents || 0),
        savingsCents: Number(p.savingsCents || 0),
        transferNetCents: Number(p.transfers.netCents || 0),
        transferGrossCents: Number(p.transfers.grossCents || 0),
      };
    });
    return { dateFrom, dateTo, accountId: null, rows };
  }

  function normalizeFinancial(payload, url) {
    const mode = url.searchParams.get("mode") || "snapshot";
    const dateFrom = url.searchParams.get("dateFrom") || "2026-09-01";
    const dateTo = url.searchParams.get("dateTo") || "2026-09-30";
    if (mode === "balances") return normalizeBalances(payload);
    if (mode === "monthly") return normalizeMonthly(payload, dateFrom, dateTo);
    return {
      contractVersion: 1,
      period: normalizePeriod(payload?.period || {}),
      balances: normalizeBalances(payload?.balances || {}),
      monthly: normalizeMonthly(payload?.monthly || [], dateFrom, dateTo),
      principles: {
        bankSource: "read_only",
        transfersExcludedFromSavings: true,
        suspectedDuplicatesIncluded: true,
        confirmedDuplicatesExcluded: true,
        manualAnalyticsExclusionRespected: true,
        explicitBankBalancePreferred: true,
      },
    };
  }

  function budgetRow(item, categoryId, categoryName) {
    const amount = Number(item?.effectiveAmountCents ?? item?.budgetCents ?? 0);
    const actual = Number(item?.actualExpenseCents || 0);
    const remaining = amount - actual;
    return {
      id: item?.id || (categoryId ? `budget-${categoryId}` : "budget-total-demo"),
      persisted: true,
      categoryId,
      categoryName,
      categoryLifecycle: categoryId ? "active" : null,
      automaticAmountCents: Number(item?.automaticAmountCents ?? amount),
      manualAmountCents: Number(item?.manualAmountCents ?? amount),
      effectiveAmountCents: amount,
      actualExpenseCents: actual,
      remainingCents: remaining,
      progressBps: amount > 0 ? Math.round((actual * 10000) / amount) : null,
      status: amount === 0 ? (actual > 0 ? "unfunded" : "empty") : actual > amount ? "over" : actual >= amount * 0.8 ? "warning" : "on_track",
      automaticExplanation: "Media ficticia de beta basada en meses completos anteriores.",
      historyMonths: [
        { month: "2026-06", expenseCents: Math.round(amount * 0.8) },
        { month: "2026-07", expenseCents: amount },
        { month: "2026-08", expenseCents: Math.round(amount * 1.1) },
      ],
    };
  }

  function normalizeBudget(payload, url) {
    const month = payload?.month || url.searchParams.get("month") || "2026-09";
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return {
      contractVersion: 1,
      month,
      monthStart: `${month}-01`,
      monthEnd: `${month}-${String(lastDay).padStart(2, "0")}`,
      total: budgetRow(payload?.total || {}, null, null),
      categories: (payload?.categories || []).map((item) => budgetRow(item, item.categoryId, item.categoryName)),
      principles: {
        bankSource: "read_only",
        actualSource: "financial_transaction_facts",
        recommendation: "trailing_3_complete_month_average",
        transfersConsumeBudget: false,
        confirmedDuplicatesConsumeBudget: false,
        manualAnalyticsExclusionsRespected: true,
        refundsNetAgainstExpense: false,
        manualOverrideWins: true,
        parentCategoryIncludesDescendants: true,
      },
    };
  }

  function normalizeRecurrences(payload) {
    const source = payload?.candidates || [];
    return {
      contractVersion: 1,
      dateFrom: null,
      dateTo: "2026-09-12",
      minOccurrences: 3,
      candidateCount: source.length,
      candidates: source.map((item, index) => ({
        candidateKey: item.candidateKey,
        accountId: "10000000-0000-4000-8000-000000000001",
        merchantId: index === 0 ? "30000000-0000-4000-8000-000000000001" : null,
        categoryId: index === 0 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000005",
        kind: index === 0 ? "expense" : "income",
        conceptPattern: item.concept || (index === 0 ? "carrefour demo" : "nómina demo"),
        intervalUnit: "month",
        intervalCount: 1,
        usualAmountCents: Number(item.amountCents || (index === 0 ? -6534 : 210000)),
        amountToleranceCents: index === 0 ? 350 : 100,
        dateToleranceDays: index === 0 ? 3 : 2,
        confidence: item.confidence || "high",
        observedConfidence: "high",
        occurrenceCount: index === 0 ? 4 : 3,
        firstObservedDate: index === 0 ? "2026-06-05" : "2026-07-01",
        lastObservedDate: index === 0 ? "2026-09-05" : "2026-09-01",
        nextEstimatedDate: index === 0 ? "2026-10-05" : "2026-10-01",
        missedCycles: 0,
        stale: false,
        existingRecurrenceId: item.existingRecurrenceId || null,
        existingStatus: item.existingStatus || null,
        explanation: "Patrón ficticio de beta CR-006. Requiere decisión humana explícita.",
      })),
      principles: {
        bankSource: "read_only",
        factSource: "financial_transaction_facts",
        eligibleKinds: ["income", "expense"],
        automaticPersistence: false,
        confidenceExplicit: true,
        weakMatchesBecomeFacts: false,
        nextDateAfterAnalysisPeriod: true,
        missedCyclesReduceConfidence: true,
      },
    };
  }

  window.fetch = async function cr006BetaCompatFetch(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const response = await betaFetch(input, init);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || !response.ok) return response;

    if (url.pathname === "/api/financial") {
      const payload = await response.clone().json().catch(() => null);
      return payload ? json(normalizeFinancial(payload, url), response.status) : response;
    }
    if (url.pathname === "/api/budgets") {
      const payload = await response.clone().json().catch(() => null);
      return payload ? json(normalizeBudget(payload, url), response.status) : response;
    }
    if (url.pathname === "/api/recurrences" && (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() === "GET") {
      const payload = await response.clone().json().catch(() => null);
      return payload ? json(normalizeRecurrences(payload), response.status) : response;
    }
    return response;
  };
})();
