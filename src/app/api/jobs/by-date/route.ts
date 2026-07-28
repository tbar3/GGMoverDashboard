import { NextRequest, NextResponse } from 'next/server';
import { requireEmployee, isBackOffice } from '@/lib/auth';
import { getJobsByDate } from '@/lib/bonus';

// Jobs (with crew) for a given date — powers the group-event picker (admin) and
// the materials count-sheet auto-fill (crew). Back office sees every job on the
// date; crew see only the jobs they're assigned to.
export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const date = request.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pass ?date=YYYY-MM-DD' }, { status: 400 });
  }

  let jobs = await getJobsByDate(date);
  if (!isBackOffice(guard.employee)) {
    jobs = jobs.filter((j) => j.crew.some((c) => c.id === guard.employee.id));
  }
  return NextResponse.json(jobs);
}
