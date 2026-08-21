import { NextResponse } from 'next/server';
import { rulesRequest } from '../../../../src/private-data/rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await rulesRequest<Record<string, unknown>>('/rules');
  return NextResponse.json(response.data, { status: response.status });
}

export async function POST(request: Request) {
  const body = await request.text();
  const response = await rulesRequest<Record<string, unknown>>('/rule', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'rule_id_required' }, { status: 400 });
  const response = await rulesRequest<Record<string, unknown>>(`/rule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  return NextResponse.json(response.data, { status: response.status });
}
