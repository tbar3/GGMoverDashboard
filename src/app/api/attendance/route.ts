import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireEmployee, requireBackOffice, isBackOffice } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const bo = isBackOffice(guard.employee);
  const date = request.nextUrl.searchParams.get('date');
  const dateGte = request.nextUrl.searchParams.get('date_gte');
  const dateLte = request.nextUrl.searchParams.get('date_lte');
  // Crew are always locked to their own attendance; back office may query anyone.
  const employeeId = bo ? request.nextUrl.searchParams.get('employee_id') : guard.employee.id;

  // Back-office "everyone on a given date" view.
  if (bo && date) {
    return NextResponse.json(await query('SELECT * FROM attendance WHERE date = $1', [date]));
  }

  // Scoped to one employee (always the caller for crew; the requested id for back office).
  if (employeeId) {
    let sql = 'SELECT * FROM attendance WHERE employee_id = $1';
    const params: unknown[] = [employeeId];
    if (dateGte) {
      sql += ` AND date >= $${params.length + 1}`;
      params.push(dateGte);
    }
    if (dateLte) {
      sql += ` AND date <= $${params.length + 1}`;
      params.push(dateLte);
    }
    sql += ' ORDER BY date DESC';
    return NextResponse.json(await query(sql, params));
  }

  // Back office, no filter → everyone.
  return NextResponse.json(await query('SELECT * FROM attendance ORDER BY date DESC'));
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const records = Array.isArray(body) ? body : [body];

  for (const record of records) {
    // Recompute late minutes server-side from scheduled start + arrival so the
    // deduction can't be spoofed by the client. Late = max(0, arrival - scheduled).
    const scheduledStart: string = record.scheduled_start || '07:15';
    const lateMinutes = minutesLate(scheduledStart, record.arrival_time);
    const isTardy = lateMinutes > 0;

    await query(
      `INSERT INTO attendance (employee_id, date, arrival_time, scheduled_start, late_minutes, is_tardy, in_uniform, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (employee_id, date)
       DO UPDATE SET arrival_time = $3, scheduled_start = $4, late_minutes = $5,
                     is_tardy = $6, in_uniform = $7, notes = $8`,
      [
        record.employee_id,
        record.date,
        record.arrival_time,
        scheduledStart,
        lateMinutes,
        isTardy,
        record.in_uniform ?? true,
        record.notes,
      ]
    );
  }

  return NextResponse.json({ success: true });
}

/** Minutes an arrival (HH:MM[:SS]) is past a scheduled start; 0 if on time/early/blank. */
function minutesLate(scheduledStart: string, arrivalTime: string | null | undefined): number {
  if (!arrivalTime) return 0;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return Math.max(0, toMin(arrivalTime) - toMin(scheduledStart));
}
