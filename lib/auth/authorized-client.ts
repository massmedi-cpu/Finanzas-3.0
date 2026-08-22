import { createClient } from "@/lib/supabase/server";
export async function getAuthorizedClient(){const supabase=await createClient();const {data,error}=await supabase.auth.getClaims();if(error||!data?.claims?.sub)return null;return supabase}
