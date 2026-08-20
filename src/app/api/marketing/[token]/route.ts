import { NextRequest, NextResponse } from 'next/server';
import { addDays, format } from 'date-fns';
import { query, queryOne } from '@/lib/db';
import { weekStartOf } from '@/lib/bonus';

// Public, token-gated endpoint for a marketing team member to log their own hours
// for one day. No login: the unguessable token in the URL maps to the employee.
// Writes the per-day row, then recomputes that week's total in marketing_hours so
// the Payroll Run (which reads the weekly total) stays correct.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  }

  const emp = await queryOne<{ id: string }>(
    'SELECT id FROM employees WHERE marketing_token = $1 AND is_active = TRUE',
    [token]
  );
  if (!emp) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const date: string = body?.date;
  const hours = Number(body?.hours);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  }
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return NextResponse.json({ error: 'Hours must be between 0 and 24' }, { status: 400 });
  }

  await query(
    `INSERT INTO marketing_day_hours (employee_id, date, hours)
     VALUES ($1, $2, $3)
     ON CONFLICT (employee_id, date) DO UPDATE SET hours = $3, updated_at = NOW()`,
    [emp.id, date, hours]
  );

  // Recompute the week's total from the day rows → the value the Payroll Run reads.
  const weekStart = weekStartOf(date);
  const weekEnd = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  await query(
    `INSERT INTO marketing_hours (employee_id, week_start, hours)
     VALUES ($1, $2, (
        SELECT COALESCE(SUM(hours), 0) FROM marketing_day_hours
         WHERE employee_id = $1 AND date >= $2 AND date <= $3
     ))
     ON CONFLICT (employee_id, week_start) DO UPDATE SET hours = EXCLUDED.hours, updated_at = NOW()`,
    [emp.id, weekStart, weekEnd]
  );

  const wk = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(hours), 0) AS total FROM marketing_day_hours
      WHERE employee_id = $1 AND date >= $2 AND date <= $3`,
    [emp.id, weekStart, weekEnd]
  );
  return NextResponse.json({ ok: true, weekTotal: Number(wk?.total ?? 0) });
}
