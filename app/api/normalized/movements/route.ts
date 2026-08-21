import { NextResponse } from 'next/server';
import {
  getNormalizedMovementsPage,
  type NormalizedCursor,
  type NormalizedReviewMode,
} from '../../../../src/normalized/client';

function int(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursorDate = url.searchParams.get('cursorDate');
  const cursorPosition = int(url.searchParams.get('cursorPosition'));
  const cursorId = url.searchParams.get('cursorId');
  const status = url.searchParams.get('status');

  if (status && !['all', 'review', 'ok'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'invalid-status' }, { status: 400 });
  }

  const cursor: NormalizedCursor | null = cursorDate && cursorPosition && cursorId
    ? { date: cursorDate, position: cursorPosition, id: cursorId }
    : null;

  try {
    const page = await getNormalizedMovementsPage({
      limit: int(url.searchParams.get('limit')) ?? 100,
      cursor,
      month: url.searchParams.get('month') || undefined,
      accountKey: url.searchParams.get('accountKey') || undefined,
      q: url.searchParams.get('q') || undefined,
      status: (status || 'all') as NormalizedReviewMode,
      includeTotal: url.searchParams.get('includeTotal') !== '0',
    });
    return NextResponse.json(page, {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error);
    const statusCode = message.includes('session') || message.includes('401') ? 401 : 502;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
