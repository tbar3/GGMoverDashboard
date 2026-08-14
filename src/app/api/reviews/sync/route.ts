import { NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { syncGoogleReviews } from '@/lib/google-reviews';

// On-demand Google-review import (back office). The scheduled pull runs weekly via
// the calendar-sync cron; this lets an admin trigger it now (e.g. right after
// Business Profile API access is granted, or to test).
export const maxDuration = 300;

export async function POST() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const result = await syncGoogleReviews();
  if ('error' in result) {
    // Soft failure (not connected / access not yet granted) — surface the message.
    return NextResponse.json({ ok: false, ...result }, { status: 200 });
  }
  return NextResponse.json({ ok: true, ...result });
}
