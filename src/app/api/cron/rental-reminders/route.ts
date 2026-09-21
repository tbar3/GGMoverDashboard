import { NextRequest, NextResponse } from 'next/server';
import { sendRentalReminders } from '@/lib/rentals-reminders';

// Daily rental digest — what still needs booking, collecting, or returning
// (Vercel cron — see vercel.json). Protected by CRON_SECRET, same as the other
// crons.
//
// ?dry=1 composes the digest and returns it WITHOUT sending or recording it,
// which is the only safe way to check this against live data. ?today=YYYY-MM-DD
// pretends it is another day, for testing a milestone without waiting for it.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dayParam = request.nextUrl.searchParams.get('today');
  const todayOverride =
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined;
  const dryRun = request.nextUrl.searchParams.get('dry') === '1';

  const result = await sendRentalReminders({ todayOverride, dryRun });
  return NextResponse.json(result);
}
