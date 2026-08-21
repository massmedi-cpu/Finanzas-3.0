import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export async function hasFinancialAppAccess(client: SupabaseClient, email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const { data, error } = await client
    .from("financial_app_access")
    .select("email,enabled")
    .eq("email", normalized)
    .eq("enabled", true)
    .maybeSingle();

  return !error && normalizeEmail(data?.email) === normalized && data?.enabled === true;
}
