import { NextResponse } from 'next/server';
import { privateDataRequest } from '../../../../src/private-data/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await privateDataRequest<Record<string, unknown>>('/future-event', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'future_event_id_required' }, { status: 400 });
  const response = await privateDataRequest<Record<string, unknown>>(`/future-event?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  return NextResponse.json(response.data, { status: response.status });
}
