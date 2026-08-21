import { NextResponse } from 'next/server';
import { rulesRequest } from '../../../../src/private-data/rules';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await rulesRequest<Record<string, unknown>>('/preview', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}
