import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const configured = Boolean(
    process.env.GOOGLE_SHEETS_SOURCE_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  );

  return NextResponse.json({
    source: 'google-sheets',
    mode: 'read-only',
    configured,
    status: configured ? 'ready-for-sync' : 'configuration-required',
  });
}
