import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getJobsByDate } from '@/lib/bonus';

// Jobs (with auto-populated crew) for a given date — powers the group-event picker.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const date = request.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pass ?date=YYYY-MM-DD' }, { status: 400 });
  }

  return NextResponse.json(await getJobsByDate(date));
}
