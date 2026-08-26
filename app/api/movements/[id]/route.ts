import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { id } = await params;
  const { data, error } = await supabase.rpc("financial_app_transaction_detail", { p_transaction_id: id });
  if (error || !data) return apiFailure("movements.detail", error, "transaction_unavailable", 404);
  return apiJson(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { id } = await params;
  let patch: unknown;
  try { patch = await request.json(); } catch { return apiError("invalid_json"); }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return apiError("invalid_patch");
  const { data, error } = await supabase.rpc("financial_app_update_transaction", { p_transaction_id: id, p_patch: patch });
  if (error || !data) return apiFailure("movements.update", error, "update_failed");
  return apiJson(data);
}
