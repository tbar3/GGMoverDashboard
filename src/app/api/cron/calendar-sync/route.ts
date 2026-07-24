import { NextRequest, NextResponse } from 'next/server';
import { format, subDays, addDays } from 'date-fns';
import { syncCalendarJobs } from '@/lib/calendar-sync';

// Scheduled Google Calendar sync (Vercel cron — see vercel.json).
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set;
// we require it so the endpoint can't be triggered by anyone else.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Refresh a window around today: recent past (late edits) + the month ahead.
  const now = new Date();
  const startDate = format(subDays(now, 7), 'yyyy-MM-dd');
  const endDate = format(addDays(now, 30), 'yyyy-MM-dd');

  const outcome = await syncCalendarJobs(startDate, endDate);
  if (!outcome.ok) {
    // Not connected yet, or the calendar is missing — report but don't 500 the
    // cron (so it keeps trying once the connection is authorized).
    return NextResponse.json(
      { ok: false, error: outcome.error, range: { startDate, endDate } },
      { status: outcome.status === 403 ? 200 : outcome.status }
    );
  }
  return NextResponse.json({ ok: true, range: { startDate, endDate }, ...outcome.result });
}
