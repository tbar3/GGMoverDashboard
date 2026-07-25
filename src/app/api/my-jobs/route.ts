import { NextRequest, NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/auth';
import { query } from '@/lib/db';
import { Job } from '@/types';

// The signed-in crew member's jobs in a date range (with their accept/decline).
export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const sp = request.nextUrl.searchParams;
  const start = sp.get('start');
  const end = sp.get('end');
  const ok = (d: string | null) => d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(start) || !ok(end)) {
    return NextResponse.json({ error: 'Pass start & end as YYYY-MM-DD' }, { status: 400 });
  }

  const [jobs, responses] = await Promise.all([
    query<Job>(
      `SELECT * FROM jobs WHERE $1 = ANY(crew_ids) AND date >= $2 AND date <= $3
       ORDER BY date ASC, start_time ASC`,
      [guard.employee.id, start, end]
    ),
    query<{ job_id: string; response: string; decline_reason: string | null }>(
      'SELECT job_id, response, decline_reason FROM job_responses WHERE employee_id = $1',
      [guard.employee.id]
    ),
  ]);

  const byJob = new Map(responses.map((r) => [r.job_id, r]));
  const result = jobs.map((j) => {
    const r = byJob.get(j.id);
    return {
      ...j,
      response: (r?.response as 'accepted' | 'declined' | undefined) ?? null,
      decline_reason: r?.decline_reason ?? null,
    };
  });
  return NextResponse.json(result);
}
