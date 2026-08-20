import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '../../../../src/security/session';

const BRIDGE_LOGIN_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-bridge/login';

export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ ok: false, status: 'invalid-request' }, { status: 400 });
  }

  const password = body.password?.trim() || '';
  if (!password) {
    return NextResponse.json({ ok: false, status: 'invalid-password' }, { status: 401 });
  }

  try {
    const upstream = await fetch(BRIDGE_LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ key: password }),
      cache: 'no-store',
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      expires_in?: number;
    };

    if (!upstream.ok || !data.ok || !data.token) {
      return NextResponse.json(
        { ok: false, status: upstream.status === 401 ? 'invalid-password' : 'bridge-unavailable' },
        { status: upstream.status === 401 ? 401 : 502 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: data.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: Math.min(Number(data.expires_in || SESSION_MAX_AGE_SECONDS), SESSION_MAX_AGE_SECONDS),
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, status: 'bridge-unavailable' }, { status: 502 });
  }
}
