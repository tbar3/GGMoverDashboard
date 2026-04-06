import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const date = request.nextUrl.searchParams.get('date');
  const employeeId = request.nextUrl.searchParams.get('employee_id');
  const dateGte = request.nextUrl.searchParams.get('date_gte');
  const dateLte = request.nextUrl.searchParams.get('date_lte');

  if (date) {
    return NextResponse.json(await query('SELECT * FROM attendance WHERE date = $1', [date]));
  }

  if (employeeId && dateGte) {
    let sql = 'SELECT * FROM attendance WHERE employee_id = $1 AND date >= $2';
    const params: unknown[] = [employeeId, dateGte];
    if (dateLte) {
      sql += ' AND date <= $3';
      params.push(dateLte);
    }
    sql += ' ORDER BY date DESC';
    return NextResponse.json(await query(sql, params));
  }

  return NextResponse.json(await query('SELECT * FROM attendance ORDER BY date DESC'));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
