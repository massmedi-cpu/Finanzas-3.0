import { NextRequest, NextResponse } from 'next/server';
import { hasUsableSessionToken, SESSION_COOKIE } from './src/security/session';

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (hasUsableSessionToken(token)) return NextResponse.next();

  const url = new URL('/login', request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== '/') url.searchParams.set('next', next);
  const response = NextResponse.redirect(url);
  if (token) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|login|api/auth|api/health|manifest.webmanifest).*)'],
};
