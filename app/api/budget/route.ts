import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

async function authorizedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = normalizeEmail(data.user?.email);
  if (error || !data.user || !(await hasFinancialAppAccess(supabase, email))) return null;
  return supabase;
}

const validMonth = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const month = validMonth(request.nextUrl.searchParams.get("month")) || new Date().toISOString().slice(0,10);
  const { data, error } = await supabase.rpc("financial_app_budget_month", { p_month: month });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "budget_unavailable" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const month = validMonth(body?.month);
  const amount = Number(body?.amount);
  if (!month || !body?.category || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ ok: false, error: "invalid_budget" }, { status: 400 });
  const { data, error } = await supabase.rpc("financial_app_upsert_budget", {
    p_budget_id: body.id || null,
    p_month: month,
    p_category: String(body.category),
    p_subcategory: body.subcategory ? String(body.subcategory) : null,
    p_amount: amount,
    p_carryover: Boolean(body.carryover),
    p_notes: body.notes ? String(body.notes) : null,
  });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "budget_update_failed" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await authorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const { data, error } = await supabase.rpc("financial_app_deactivate_budget", { p_budget_id: id });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "budget_delete_failed" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
