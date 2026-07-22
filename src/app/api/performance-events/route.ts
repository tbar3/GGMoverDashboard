import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  return NextResponse.json(
    await query('SELECT * FROM performance_events ORDER BY date DESC')
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO performance_events (employee_id, type, description, date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [body.employee_id, body.type, body.description, body.date]
  );

  return NextResponse.json(row, { status: 201 });
}
