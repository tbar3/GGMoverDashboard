import { NextRequest, NextResponse } from 'next/server';
import { format, subDays, addDays } from 'date-fns';
import { syncCalendarJobs } from '@/lib/calendar-sync';
import { syncGoogleReviews } from '@/lib/google-reviews';

// Business Profile review sync is heavier than the calendar pull; give it room.
export const maxDuration = 300;

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

  // Piggyback the weekly Google-review import here (Vercel Hobby caps the project
  // at 2 cron jobs — both used — so we run this once a week instead of adding a
  // 3rd cron). Mondays only; best-effort so a review-side failure never fails the
  // calendar cron. day 1 = Monday.
  let reviews: unknown = undefined;
  if (now.getUTCDay() === 1) {
    try {
      reviews = await syncGoogleReviews();
    } catch (e) {
      reviews = { error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  if (!outcome.ok) {
    // Not connected yet, or the calendar is missing — report but don't 500 the
    // cron (so it keeps trying once the connection is authorized).
    return NextResponse.json(
      { ok: false, error: outcome.error, range: { startDate, endDate }, reviews },
      { status: outcome.status === 403 ? 200 : outcome.status }
    );
  }
  return NextResponse.json({ ok: true, range: { startDate, endDate }, reviews, ...outcome.result });
}
