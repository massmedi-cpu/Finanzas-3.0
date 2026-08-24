import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("financial_app_transaction_detail", { p_transaction_id: id });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "transaction_unavailable" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let patch: unknown;
  try { patch = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return NextResponse.json({ ok: false, error: "invalid_patch" }, { status: 400 });
  const { data, error } = await supabase.rpc("financial_app_update_transaction", { p_transaction_id: id, p_patch: patch });
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "update_failed" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
