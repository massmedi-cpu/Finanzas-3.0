import { NextResponse } from 'next/server';
import { createSessionToken, isAccessProtectionConfigured, SESSION_COOKIE } from '../../../../src/security/session';

export async function POST(request: Request) {
  if (!isAccessProtectionConfigured()) {
    return NextResponse.json({ ok: false, status: 'access-not-configured' }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const configuredPassword = process.env.APP_ACCESS_PASSWORD?.trim() || '';
  const secret = process.env.APP_SESSION_SECRET?.trim() || '';
  const suppliedPassword = body.password || '';

  const supplied = await createSessionToken(suppliedPassword, secret);
  const expected = await createSessionToken(configuredPassword, secret);
  if (supplied !== expected) {
    return NextResponse.json({ ok: false, status: 'invalid-password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: expected,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
