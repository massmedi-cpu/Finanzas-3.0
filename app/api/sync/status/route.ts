import { NextResponse } from 'next/server';
import { isGoogleSheetsConfigured } from '../../../../src/sync/google-sheets';

export const dynamic = 'force-dynamic';

export function GET() {
  const configured = isGoogleSheetsConfigured();

  return NextResponse.json({
    source: 'google-sheets',
    mode: 'read-only',
    configured,
    status: configured ? 'ready-for-sync' : 'configuration-required',
  });
}
