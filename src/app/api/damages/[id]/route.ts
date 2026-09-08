import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const amount = Number(body.amount);

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'A description and a positive damage amount are required' },
      { status: 400 }
    );
  }

  // effective_date decides which payout period this damage comes out of, so it is
  // never inferred on an edit — a bad or missing value would silently move money
  // between periods.
  if (!DATE_ONLY.test(body.effective_date ?? '')) {
    return NextResponse.json({ error: 'A valid effective date is required' }, { status: 400 });
  }

  // job_date, unlike on create, is taken literally: clearing it is a deliberate
  // "this damage isn't tied to that job's date" and must not be re-filled.
  const jobDate = DATE_ONLY.test(body.job_date ?? '') ? body.job_date : null;

  const row = await queryOne(
    `UPDATE damages
        SET job_id = $1, employee_ids = $2, description = $3, amount = $4,
            was_reported = $5, job_date = $6, effective_date = $7
      WHERE id = $8
      RETURNING *`,
    [
      body.job_id || null,
      Array.isArray(body.employee_ids) ? body.employee_ids : [],
      description,
      amount,
      body.was_reported !== false,
      jobDate,
      body.effective_date,
      id,
    ]
  );

  if (!row) return NextResponse.json({ error: 'Damage not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await queryOne('DELETE FROM damages WHERE id = $1 RETURNING id', [id]);

  if (!row) return NextResponse.json({ error: 'Damage not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
