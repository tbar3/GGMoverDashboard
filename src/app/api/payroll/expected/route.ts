import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// Returns expected hours and pay per employee for a given week,
// based on jobs they're assigned to in that date range.
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const weekStart = request.nextUrl.searchParams.get('week_start');
  const weekEnd = request.nextUrl.searchParams.get('week_end');

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'week_start and week_end required' }, { status: 400 });
  }

  // Get all jobs in this date range that have estimated_hours
  const jobs = await query<{
    id: string;
    date: string;
    estimated_hours: number | null;
    crew_ids: string[];
    customer_name: string;
    job_number: string | null;
    start_time: string | null;
    end_time: string | null;
  }>(
    `SELECT id, date, estimated_hours, crew_ids, customer_name, job_number, start_time, end_time
     FROM jobs WHERE date >= $1 AND date <= $2`,
    [weekStart, weekEnd]
  );

  // Get all active employees with their hourly rates
  const employees = await query<{
    id: string;
    name: string;
    hourly_rate: number | null;
  }>('SELECT id, name, hourly_rate FROM employees WHERE is_active = true');

  // Build per-employee expected data
  const expected: Record<string, {
    employee_id: string;
    employee_name: string;
    hourly_rate: number;
    expected_hours: number;
    expected_pay: number;
    job_count: number;
    jobs: { id: string; customer_name: string; job_number: string | null; date: string; estimated_hours: number | null; start_time: string | null; end_time: string | null }[];
  }> = {};

  for (const emp of employees) {
    expected[emp.id] = {
      employee_id: emp.id,
      employee_name: emp.name,
      hourly_rate: Number(emp.hourly_rate) || 0,
      expected_hours: 0,
      expected_pay: 0,
      job_count: 0,
      jobs: [],
    };
  }

  for (const job of jobs) {
    if (!job.crew_ids || job.crew_ids.length === 0) continue;
    const hours = Number(job.estimated_hours) || 0;

    for (const crewId of job.crew_ids) {
      if (expected[crewId]) {
        expected[crewId].expected_hours += hours;
        expected[crewId].job_count++;
        expected[crewId].jobs.push({
          id: job.id,
          customer_name: job.customer_name,
          job_number: job.job_number,
          date: job.date,
          estimated_hours: job.estimated_hours,
          start_time: job.start_time,
          end_time: job.end_time,
        });
      }
    }
  }

  // Calculate expected pay
  for (const emp of Object.values(expected)) {
    emp.expected_pay = emp.expected_hours * emp.hourly_rate;
  }

  return NextResponse.json(Object.values(expected));
}
