import { getCalendarClient } from '@/lib/google';
import { NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const calendar = await getCalendarClient();
  if (!calendar) {
    return NextResponse.json({ connected: false });
  }

  try {
    // Check that the token works AND the SmartMoving Jobs calendar exists
    const calendarList = await calendar.calendarList.list();
    const smartMovingCal = calendarList.data.items?.find(
      (cal) => cal.summary?.toLowerCase().includes('smartmoving jobs')
    );

    return NextResponse.json({
      connected: true,
      calendarFound: !!smartMovingCal,
      calendarName: smartMovingCal?.summary || null,
    });
  } catch {
    return NextResponse.json({ connected: false, calendarFound: false });
  }
}
