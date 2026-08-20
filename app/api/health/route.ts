import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    application: 'Finanzas 3.0',
    version: '2.0.1',
    timestamp: new Date().toISOString(),
  });
}
