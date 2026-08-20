import { NextResponse } from 'next/server';
import { isGoogleSheetsConfigured } from '../../../../src/sync/google-sheets';
import { loadValidatedSource } from '../../../../src/sync/import-source';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        status: 'configuration-required',
      },
      { status: 503 },
    );
  }

  try {
    const preview = await loadValidatedSource();

    return NextResponse.json({
      ok: true,
      status: 'source-validated',
      sourceRows: preview.rows.length,
      accounts: preview.accounts,
      duplicateGroups: preview.duplicateGroups,
      needsReview: preview.needsReview,
      latestMonth: preview.latestMonth,
      latestMonthSummary: preview.latestMonthSummary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'source-error',
        message: error instanceof Error ? error.message : 'Unknown synchronization error',
      },
      { status: 502 },
    );
  }
}
