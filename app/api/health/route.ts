import { NextResponse } from 'next/server';
import { APP_VERSION } from '../../../src/version';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    application: 'Finanzas 3.0',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
}
