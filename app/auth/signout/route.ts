import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
