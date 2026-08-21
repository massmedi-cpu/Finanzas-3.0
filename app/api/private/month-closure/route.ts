import { NextResponse } from 'next/server';
import { mutateMonthClosure } from '../../../../src/private-data/month-closure';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const response = await mutateMonthClosure(body as Record<string, unknown>);
  return NextResponse.json(response.data, { status: response.status });
}
