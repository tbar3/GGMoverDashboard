import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { CONFIG } from '@/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();

  const miles = Number(body.miles);
  if (!body.employee_id || !body.date || !Number.isFinite(miles) || miles <= 0) {
    return NextResponse.json(
      { error: 'Employee, date and a positive mileage figure are required' },
      { status: 400 }
    );
  }

  // The rate is authoritative here, not whatever the client computed.
  const amount = miles * CONFIG.MILEAGE_RATE;

  const row = await queryOne(
    `UPDATE mileage_entries
        SET employee_id = $1, job_id = $2, date = $3, miles = $4, amount = $5
      WHERE id = $6
      RETURNING *`,
    [body.employee_id, body.job_id || null, body.date, miles, amount, id]
  );

  if (!row) return NextResponse.json({ error: 'Mileage entry not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await queryOne('DELETE FROM mileage_entries WHERE id = $1 RETURNING id', [id]);

  if (!row) return NextResponse.json({ error: 'Mileage entry not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
