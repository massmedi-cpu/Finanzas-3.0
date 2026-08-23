import { NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabase.rpc("financial_app_system_integrity");
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "system_integrity_unavailable" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabase.rpc("financial_app_run_system_audit");
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "system_audit_failed" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
