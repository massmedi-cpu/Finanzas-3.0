import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function bearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function authorized(token: string) {
  if (!token) return false;
  try {
    const response = await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_ROLE);
  headers.set("authorization", `Bearer ${SERVICE_ROLE}`);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const response = await fetch(`${REST}/${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `db_${response.status}`);
  return data;
}

function cleanText(value: unknown, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function validDate(value: unknown) {
  const text = cleanText(value, 10);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  if (value === "" || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pathOf(req: Request) {
  const url = new URL(req.url);
  const marker = "/finanzas-v3-data";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? (url.pathname.slice(index + marker.length) || "/") : url.pathname;
}

Deno.serve(async (req: Request) => {
  const path = pathOf(req);
  if (path === "/health") return json({ ok: true, version: 3 });

  const token = bearer(req);
  if (!(await authorized(token))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    if (path === "/state" && req.method === "GET") {
      const [overrides, budgets, goals, futureEvents, scenarios] = await Promise.all([
        rest("finance_v3_movement_overrides?select=*&order=updated_at.desc"),
        rest("finance_v3_budgets?select=*&order=year_month.desc,category.asc"),
        rest("finance_v3_goals?select=*&order=active.desc,target_date.asc.nullslast,created_at.asc"),
        rest("finance_v3_future_events?select=*&order=active.desc,expected_date.asc,created_at.asc"),
        rest("finance_v3_scenarios?select=*&order=active.desc,created_at.asc"),
      ]);
      return json({ ok: true, overrides, budgets, goals, futureEvents, scenarios });
    }

    if (path === "/movement" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const sourceId = cleanText(body.sourceId, 200);
      if (!sourceId) return json({ ok: false, error: "source_id_required" }, 400);
      const reviewStatus = ["pending", "reviewed", "ignored"].includes(body.reviewStatus) ? body.reviewStatus : "pending";
      const payload = {
        source_id: sourceId,
        category: cleanText(body.category, 120),
        subcategory: cleanText(body.subcategory, 120),
        merchant: cleanText(body.merchant, 180),
        notes: cleanText(body.notes, 2000),
        tags: Array.isArray(body.tags) ? body.tags.map((v: unknown) => String(v).trim()).filter(Boolean).slice(0, 20) : [],
        review_status: reviewStatus,
        reconciled: Boolean(body.reconciled),
        excluded_from_analytics: Boolean(body.excludedFromAnalytics),
      };
      const result = await rest("finance_v3_movement_overrides?on_conflict=source_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      return json({ ok: true, override: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/movement" && req.method === "DELETE") {
      const sourceId = cleanText(new URL(req.url).searchParams.get("sourceId"), 200);
      if (!sourceId) return json({ ok: false, error: "source_id_required" }, 400);
      await rest(`finance_v3_movement_overrides?source_id=eq.${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
      return json({ ok: true });
    }

    if (path === "/budget" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const yearMonth = cleanText(body.yearMonth, 7);
      const category = cleanText(body.category, 120);
      const assigned = Number(body.assigned);
      if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth) || !category || !Number.isFinite(assigned) || assigned < 0) {
        return json({ ok: false, error: "invalid_budget" }, 400);
      }
      const result = await rest("finance_v3_budgets?on_conflict=year_month,category", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ year_month: yearMonth, category, assigned, rollover: Boolean(body.rollover), notes: cleanText(body.notes, 1000) }),
      });
      return json({ ok: true, budget: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/goal" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = cleanText(body.name, 180);
      const targetAmount = Number(body.targetAmount);
      const currentAmount = Number(body.currentAmount ?? 0);
      const monthlyContribution = body.monthlyContribution == null || body.monthlyContribution === "" ? null : Number(body.monthlyContribution);
      if (!name || !Number.isFinite(targetAmount) || targetAmount < 0 || !Number.isFinite(currentAmount) || currentAmount < 0 || (monthlyContribution !== null && (!Number.isFinite(monthlyContribution) || monthlyContribution < 0))) {
        return json({ ok: false, error: "invalid_goal" }, 400);
      }
      const payload: Record<string, unknown> = {
        name,
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: validDate(body.targetDate),
        monthly_contribution: monthlyContribution,
        active: body.active !== false,
        notes: cleanText(body.notes, 1000),
      };
      if (body.id) payload.id = cleanText(body.id, 36);
      const result = await rest("finance_v3_goals?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      return json({ ok: true, goal: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/goal" && req.method === "DELETE") {
      const id = cleanText(new URL(req.url).searchParams.get("id"), 36);
      if (!id) return json({ ok: false, error: "goal_id_required" }, 400);
      await rest(`finance_v3_goals?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      return json({ ok: true });
    }

    if (path === "/future-event" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const title = cleanText(body.title, 180);
      const expectedDate = validDate(body.expectedDate);
      const amount = finiteNumber(body.amount);
      const recurrence = ["once", "monthly", "yearly"].includes(body.recurrence) ? body.recurrence : "once";
      const recurrenceEnd = body.recurrenceEnd ? validDate(body.recurrenceEnd) : null;
      if (!title || !expectedDate || amount === null || amount === 0 || (body.recurrenceEnd && !recurrenceEnd) || (recurrenceEnd && recurrenceEnd < expectedDate)) {
        return json({ ok: false, error: "invalid_future_event" }, 400);
      }
      const payload: Record<string, unknown> = {
        title,
        expected_date: expectedDate,
        amount,
        category: cleanText(body.category, 120),
        account: cleanText(body.account, 180),
        recurrence,
        recurrence_end: recurrenceEnd,
        active: body.active !== false,
        notes: cleanText(body.notes, 1000),
      };
      if (body.id) payload.id = cleanText(body.id, 36);
      const result = await rest("finance_v3_future_events?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      return json({ ok: true, futureEvent: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/future-event" && req.method === "DELETE") {
      const id = cleanText(new URL(req.url).searchParams.get("id"), 36);
      if (!id) return json({ ok: false, error: "future_event_id_required" }, 400);
      await rest(`finance_v3_future_events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      return json({ ok: true });
    }

    if (path === "/scenario" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = cleanText(body.name, 180);
      const incomeChangePct = finiteNumber(body.incomeChangePct, 0);
      const expenseChangePct = finiteNumber(body.expenseChangePct, 0);
      const monthlyNetAdjustment = finiteNumber(body.monthlyNetAdjustment, 0);
      const monthlySavingsAllocation = finiteNumber(body.monthlySavingsAllocation, 0);
      const startingBalanceAdjustment = finiteNumber(body.startingBalanceAdjustment, 0);
      const horizonMonths = Math.trunc(Number(body.horizonMonths ?? 12));
      if (!name || incomeChangePct === null || expenseChangePct === null || monthlyNetAdjustment === null || monthlySavingsAllocation === null || startingBalanceAdjustment === null || incomeChangePct < -100 || incomeChangePct > 1000 || expenseChangePct < -100 || expenseChangePct > 1000 || monthlySavingsAllocation < 0 || !Number.isFinite(horizonMonths) || horizonMonths < 1 || horizonMonths > 60) {
        return json({ ok: false, error: "invalid_scenario" }, 400);
      }
      const payload: Record<string, unknown> = {
        name,
        income_change_pct: incomeChangePct,
        expense_change_pct: expenseChangePct,
        monthly_net_adjustment: monthlyNetAdjustment,
        monthly_savings_allocation: monthlySavingsAllocation,
        starting_balance_adjustment: startingBalanceAdjustment,
        horizon_months: horizonMonths,
        active: body.active !== false,
        notes: cleanText(body.notes, 1000),
      };
      if (body.id) payload.id = cleanText(body.id, 36);
      const result = await rest("finance_v3_scenarios?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      return json({ ok: true, scenario: Array.isArray(result) ? result[0] : result });
    }

    if (path === "/scenario" && req.method === "DELETE") {
      const id = cleanText(new URL(req.url).searchParams.get("id"), 36);
      if (!id) return json({ ok: false, error: "scenario_id_required" }, 400);
      await rest(`finance_v3_scenarios?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      return json({ ok: true });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("finanzas_v3_data_error", String((error as Error)?.message || error));
    return json({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
