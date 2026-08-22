import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/auth/access";

export async function requireAuthorizedUser(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getClaims();
  const id=typeof data?.claims?.sub==="string"?data.claims.sub:"";
  const email=normalizeEmail(typeof data?.claims?.email==="string"?data.claims.email:null);
  if(error||!id||!email)redirect("/login");
  return{id,email};
}
