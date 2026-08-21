import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth/authorization";

export async function requireAuthorizedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;

  if (error || !claims?.sub || !isAllowedEmail(email)) redirect("/login");
  return { id: claims.sub, email: email! };
}
