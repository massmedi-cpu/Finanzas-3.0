import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { id } = await params;
  const { data, error } = await supabase.rpc("financial_app_transaction_splits", { p_transaction_id: id });
  if (error || !data) return apiFailure("movements.splits.read", error, "splits_unavailable");
  return apiJson({ ok: true, data });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError("invalid_json"); }
  const splits = (body as { splits?: unknown } | null)?.splits;
  if (!Array.isArray(splits) || splits.length === 1 || splits.length > 50) return apiError("invalid_splits");
  const { data, error } = await supabase.rpc("financial_app_replace_transaction_splits", { p_transaction_id: id, p_splits: splits });
  if (error || !data) return apiFailure("movements.splits.update", error, "split_update_failed");
  return apiJson({ ok: true, data });
}
