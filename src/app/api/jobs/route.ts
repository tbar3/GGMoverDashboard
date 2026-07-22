import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireEmployee, requireBackOffice, isBackOffice } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const bo = isBackOffice(guard.employee);
  const date = request.nextUrl.searchParams.get('date');
  const limit = request.nextUrl.searchParams.get('limit');
  // Crew are locked to jobs they're assigned to; back office may query anyone / all.
  const employeeId = bo ? request.nextUrl.searchParams.get('employee_id') : guard.employee.id;

  if (date && employeeId) {
    return NextResponse.json(await query(
      'SELECT * FROM jobs WHERE date = $1 AND $2 = ANY(crew_ids)',
      [date, employeeId]
    ));
  }

  if (employeeId) {
    let sql = 'SELECT * FROM jobs WHERE $1 = ANY(crew_ids) ORDER BY date DESC';
    if (limit) sql += ` LIMIT ${parseInt(limit)}`;
    return NextResponse.json(await query(sql, [employeeId]));
  }

  // Back office, no filter → all jobs.
  let sql = 'SELECT * FROM jobs ORDER BY date DESC';
  if (limit) sql += ` LIMIT ${parseInt(limit)}`;

  return NextResponse.json(await query(sql));
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO jobs (date, customer_name, pickup_address, dropoff_address, revenue, crew_ids)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [body.date, body.customer_name, body.pickup_address, body.dropoff_address, body.revenue, body.crew_ids]
  );

  return NextResponse.json(row, { status: 201 });
}
