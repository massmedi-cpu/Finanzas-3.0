import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { data, error } = await supabase.rpc("financial_app_system_integrity");
  if (error || !data) return apiFailure("control.integrity", error, "system_integrity_unavailable");
  return apiJson(data);
}

export async function POST() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { data, error } = await supabase.rpc("financial_app_run_system_audit");
  if (error || !data) return apiFailure("control.system_audit", error, "system_audit_failed");
  return apiJson(data);
}
