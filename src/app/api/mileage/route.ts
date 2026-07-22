import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  return NextResponse.json(
    await query('SELECT * FROM mileage_entries ORDER BY date DESC')
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO mileage_entries (employee_id, job_id, date, miles, amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [body.employee_id, body.job_id, body.date, body.miles, body.amount]
  );

  return NextResponse.json(row, { status: 201 });
}
