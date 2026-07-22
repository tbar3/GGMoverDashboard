import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  return NextResponse.json(
    await query('SELECT * FROM damages ORDER BY created_at DESC')
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO damages (job_id, employee_ids, description, amount, was_reported)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [body.job_id, body.employee_ids, body.description, body.amount, body.was_reported]
  );

  return NextResponse.json(row, { status: 201 });
}
