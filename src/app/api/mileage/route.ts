import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json(
    await query('SELECT * FROM mileage_entries ORDER BY date DESC')
  );
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO mileage_entries (employee_id, job_id, date, miles, amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [body.employee_id, body.job_id, body.date, body.miles, body.amount]
  );

  return NextResponse.json(row, { status: 201 });
}
