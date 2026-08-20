import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    application: 'Finanzas 3.0',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
  });
}
