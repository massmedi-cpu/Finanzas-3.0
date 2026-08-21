import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

export async function requireAuthorizedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = normalizeEmail(data.user?.email);

  if (error || !data.user) redirect("/login");
  if (!(await hasFinancialAppAccess(supabase, email))) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=unauthorized");
  }

  return { id: data.user.id, email };
}
