import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireEmployee, isBackOffice } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  // Crew see only their own completions; back office may query anyone / everyone.
  const bo = isBackOffice(guard.employee);
  const employeeId = bo ? request.nextUrl.searchParams.get('employee_id') : guard.employee.id;
  const jobIds = request.nextUrl.searchParams.get('job_ids');

  if (employeeId && jobIds) {
    const ids = jobIds.split(',');
    return NextResponse.json(await query(
      `SELECT * FROM checklist_completions WHERE employee_id = $1 AND job_id = ANY($2)`,
      [employeeId, ids]
    ));
  }

  if (employeeId) {
    return NextResponse.json(
      await query('SELECT * FROM checklist_completions WHERE employee_id = $1', [employeeId])
    );
  }

  // Back office, no filter → everyone.
  return NextResponse.json(await query('SELECT * FROM checklist_completions'));
}

export async function POST(request: NextRequest) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  // Crew can only record their own checklist; back office may record on anyone's behalf.
  const employeeId = isBackOffice(guard.employee)
    ? (body.employee_id ?? guard.employee.id)
    : guard.employee.id;

  const row = await queryOne(
    `INSERT INTO checklist_completions (job_id, employee_id, role, items_completed, completed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id, employee_id)
     DO UPDATE SET items_completed = $4, completed_at = $5
     RETURNING *`,
    [body.job_id, employeeId, body.role, body.items_completed, body.completed_at]
  );

  return NextResponse.json(row);
}
