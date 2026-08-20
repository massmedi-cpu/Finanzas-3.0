import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './src/security/session';

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = new URL('/login', request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== '/') url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/health|manifest.webmanifest).*)'],
};
