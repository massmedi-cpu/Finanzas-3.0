import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = normalizeEmail(userData.user?.email);
  if (userError || !userData.user || !(await hasFinancialAppAccess(supabase, email))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    return NextResponse.json({ ok: false, error: "session_unavailable" }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/financial-app-sync`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "sync" }),
      cache: "no-store",
    });

    const raw = await upstream.text();
    let payload: Record<string, unknown>;
    try {
      payload = raw ? JSON.parse(raw) : { ok: false, error: `sync_upstream_${upstream.status}` };
    } catch {
      payload = { ok: false, error: `sync_upstream_${upstream.status}` };
    }

    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "sync_unavailable" }, { status: 502 });
  }
}
