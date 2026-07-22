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
    await query(
      `INSERT INTO attendance (employee_id, date, arrival_time, is_tardy, in_uniform, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (employee_id, date)
       DO UPDATE SET arrival_time = $3, is_tardy = $4, in_uniform = $5, notes = $6`,
      [record.employee_id, record.date, record.arrival_time, record.is_tardy, record.in_uniform ?? true, record.notes]
    );
  }

  return NextResponse.json({ success: true });
}
