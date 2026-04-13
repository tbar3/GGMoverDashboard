import { currentUser } from '@clerk/nextjs/server';
import { getCalendarClient } from '@/lib/google';
import { NextResponse } from 'next/server';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
