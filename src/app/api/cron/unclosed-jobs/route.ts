import { NextRequest, NextResponse } from 'next/server';
import { sendUnclosedJobsAlert } from '@/lib/materials/unclosed-jobs-alert';

// Daily email of the materials count sheets left unclosed the PREVIOUS day
// (Vercel cron — see vercel.json). Protected by CRON_SECRET, same as the other
// crons. Pass ?day=YYYY-MM-DD (with the secret) to test a specific day.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dayParam = request.nextUrl.searchParams.get('day');
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined;

  const result = await sendUnclosedJobsAlert(day);
  return NextResponse.json(result);
}
