import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json(
    await query('SELECT * FROM performance_events ORDER BY date DESC')
  );
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO performance_events (employee_id, type, description, date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [body.employee_id, body.type, body.description, body.date]
  );

  return NextResponse.json(row, { status: 201 });
}
