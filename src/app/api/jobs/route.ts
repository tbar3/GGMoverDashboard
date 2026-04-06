import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const date = request.nextUrl.searchParams.get('date');
  const employeeId = request.nextUrl.searchParams.get('employee_id');
  const limit = request.nextUrl.searchParams.get('limit');

  if (date && employeeId) {
    const rows = await query(
      'SELECT * FROM jobs WHERE date = $1 AND $2 = ANY(crew_ids)',
      [date, employeeId]
    );
    return NextResponse.json(rows);
  }

  let sql = 'SELECT * FROM jobs ORDER BY date DESC';
  if (limit) sql += ` LIMIT ${parseInt(limit)}`;

  return NextResponse.json(await query(sql));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO jobs (date, customer_name, pickup_address, dropoff_address, revenue, crew_ids)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [body.date, body.customer_name, body.pickup_address, body.dropoff_address, body.revenue, body.crew_ids]
  );

  return NextResponse.json(row, { status: 201 });
}
