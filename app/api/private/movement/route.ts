import { NextResponse } from 'next/server';
import { privateDataRequest } from '../../../../src/private-data/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await privateDataRequest<Record<string, unknown>>('/movement', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}

export async function DELETE(request: Request) {
  const sourceId = new URL(request.url).searchParams.get('sourceId');
  if (!sourceId) return NextResponse.json({ ok: false, error: 'source_id_required' }, { status: 400 });
  const response = await privateDataRequest<Record<string, unknown>>(`/movement?sourceId=${encodeURIComponent(sourceId)}`, { method: 'DELETE' });
  return NextResponse.json(response.data, { status: response.status });
}
