import { NextResponse } from 'next/server';
import { captureSystemAudit } from '../../../../src/private-data/control-center';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const audit = await captureSystemAudit(typeof body.note === 'string' ? body.note : undefined);
    return NextResponse.json({ ok: true, audit });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
