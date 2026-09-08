import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  // Newest payout first — effective_date is the date that matters for reconciling
  // a period; created_at only breaks ties between damages paid the same day.
  return NextResponse.json(
    await query(
      'SELECT * FROM damages ORDER BY effective_date DESC, created_at DESC'
    )
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();

  // job_date defaults to the linked job's date, so the common case needs no input.
  // An explicit value still wins (damage found later, job date corrected, etc.).
  const jobDate =
    body.job_date ||
    (body.job_id
      ? (await queryOne<{ date: string }>('SELECT date FROM jobs WHERE id = $1', [body.job_id]))?.date
      : null) ||
    null;

  const row = await queryOne(
    `INSERT INTO damages (job_id, employee_ids, description, amount, was_reported, job_date, effective_date)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE)) RETURNING *`,
    [
      body.job_id,
      body.employee_ids,
      body.description,
      body.amount,
      body.was_reported,
      jobDate,
      body.effective_date || null,
    ]
  );

  return NextResponse.json(row, { status: 201 });
}
