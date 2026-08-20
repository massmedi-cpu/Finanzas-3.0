import { NextResponse } from 'next/server';
import { privateDataRequest } from '../../../../src/private-data/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.text();
  const response = await privateDataRequest<Record<string, unknown>>('/budget', { method: 'POST', body });
  return NextResponse.json(response.data, { status: response.status });
}
