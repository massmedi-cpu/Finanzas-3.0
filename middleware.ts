import { NextRequest, NextResponse } from 'next/server';
import { expectedSessionToken, SESSION_COOKIE } from './src/security/session';

export async function middleware(request: NextRequest) {
  const expected = await expectedSessionToken();

  if (!expected) {
    const url = new URL('/login', request.url);
    url.searchParams.set('setup', '1');
    return NextResponse.redirect(url);
  }

  const current = request.cookies.get(SESSION_COOKIE)?.value;
  if (current === expected) return NextResponse.next();

  const url = new URL('/login', request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== '/') url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/health).*)'],
};
