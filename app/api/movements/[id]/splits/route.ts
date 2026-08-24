import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("financial_app_transaction_splits", { p_transaction_id: id });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "splits_unavailable" }, { status: 400 });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const splits = (body as { splits?: unknown } | null)?.splits;
  if (!Array.isArray(splits) || splits.length === 1 || splits.length > 50) {
    return NextResponse.json({ ok: false, error: "invalid_splits" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("financial_app_replace_transaction_splits", { p_transaction_id: id, p_splits: splits });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "split_update_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
