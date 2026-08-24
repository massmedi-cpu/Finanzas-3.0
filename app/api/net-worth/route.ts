import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { normalizeNetWorth } from "@/lib/financial/net-worth";
import { asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const requested = Number(request.nextUrl.searchParams.get("months") || 18);
  const months = Number.isFinite(requested) ? Math.max(6, Math.min(60, Math.trunc(requested))) : 18;
  const { data, error } = await supabase.rpc("financial_app_net_worth_overview", { p_months: months });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "net_worth_unavailable" }, { status: 400 });
  return NextResponse.json(normalizeNetWorth(data), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const input=asRecord(body);const value=asNumber(input.value,Number.NaN);const type=asString(input.itemType);const itemType=type==="liability"?"liability":type==="asset"?"asset":null;
  const valuationDate = typeof input.valuationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.valuationDate) ? input.valuationDate : null;
  const name=asString(input.name).trim();
  if (!name || !itemType || !Number.isFinite(value) || value < 0 || !valuationDate) return NextResponse.json({ ok: false, error: "invalid_item" }, { status: 400 });
  const { error } = await supabase.rpc("financial_app_upsert_net_worth_item", {p_id:nullableString(input.id),p_name:name,p_item_type:itemType,p_category:nullableString(input.category),p_value:value,p_valuation_date:valuationDate,p_include:input.includeInTotal==null?true:asBoolean(input.includeInTotal),p_notes:nullableString(input.notes)});
  if (error) return NextResponse.json({ ok: false, error: error.message || "net_worth_update_failed" }, { status: 400 });
  const { data, error: readError } = await supabase.rpc("financial_app_net_worth_overview", { p_months: 18 });
  if (readError || !data) return NextResponse.json({ ok: false, error: readError?.message || "net_worth_unavailable" }, { status: 400 });
  return NextResponse.json(normalizeNetWorth(data), { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const { error } = await supabase.rpc("financial_app_deactivate_net_worth_item", { p_id: id });if (error) return NextResponse.json({ ok: false, error: error.message || "net_worth_delete_failed" }, { status: 400 });
  const { data, error: readError } = await supabase.rpc("financial_app_net_worth_overview", { p_months: 18 });if (readError || !data) return NextResponse.json({ ok: false, error: readError?.message || "net_worth_unavailable" }, { status: 400 });
  return NextResponse.json(normalizeNetWorth(data), { headers: { "Cache-Control": "private, no-store" } });
}
