import { NextResponse } from 'next/server';
import { recurringDataRequest } from '../../../../src/private-data/recurring';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await recurringDataRequest<Record<string, unknown>>('/preference', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}

export async function DELETE(request: Request) {
  const patternKey = new URL(request.url).searchParams.get('patternKey');
  if (!patternKey) return NextResponse.json({ ok: false, error: 'pattern_key_required' }, { status: 400 });
  const response = await recurringDataRequest<Record<string, unknown>>(`/preference?patternKey=${encodeURIComponent(patternKey)}`, { method: 'DELETE' });
  return NextResponse.json(response.data, { status: response.status });
}
