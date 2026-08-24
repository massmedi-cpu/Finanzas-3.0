import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function getAuthorizedClient(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  const email=normalizeEmail(data.user?.email);
  if(error||!data.user||!(await hasFinancialAppAccess(supabase,email))) return null;
  return supabase;
}
