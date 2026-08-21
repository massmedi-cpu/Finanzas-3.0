import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";
import type { MovementsResponse } from "@/lib/financial/movements";

async function authorizedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = normalizeEmail(data.user?.email);
  if (error || !data.user || !(await hasFinancialAppAccess(supabase, email))) return null;
  return supabase;
}

function numberParam(value: string | null) {
  if (!value) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const { data, error } = await supabase.rpc("financial_app_movements", {
    p_page: Math.max(1, Number(q.get("page") || 1)),
    p_page_size: Math.min(200, Math.max(1, Number(q.get("pageSize") || 50))),
    p_search: q.get("search") || null,
    p_account_id: q.get("account") || null,
    p_type: q.get("type") || null,
    p_category: q.get("category") || null,
    p_review_only: q.get("review") === "1",
    p_date_from: q.get("from") || null,
    p_date_to: q.get("to") || null,
    p_min_amount: numberParam(q.get("min")),
    p_max_amount: numberParam(q.get("max")),
    p_sort: q.get("sort") || "date_desc",
  });

  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "movements_unavailable" }, { status: 400 });
  const response = data as MovementsResponse;
  const newIds = response.items.filter(item=>item.status==="new").map(item=>item.id);
  if (newIds.length) await supabase.rpc("financial_app_mark_new_seen", { p_ids: newIds });
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
