import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const employeeId = request.nextUrl.searchParams.get('employee_id');
  const jobIds = request.nextUrl.searchParams.get('job_ids');

  if (employeeId && jobIds) {
    const ids = jobIds.split(',');
    const rows = await query(
      `SELECT * FROM checklist_completions WHERE employee_id = $1 AND job_id = ANY($2)`,
      [employeeId, ids]
    );
    return NextResponse.json(rows);
  }

  return NextResponse.json(await query('SELECT * FROM checklist_completions'));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const row = await queryOne(
    `INSERT INTO checklist_completions (job_id, employee_id, role, items_completed, completed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id, employee_id)
     DO UPDATE SET items_completed = $4, completed_at = $5
     RETURNING *`,
    [body.job_id, body.employee_id, body.role, body.items_completed, body.completed_at]
  );

  return NextResponse.json(row);
}
