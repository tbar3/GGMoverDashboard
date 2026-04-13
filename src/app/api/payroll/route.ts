import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const employeeId = request.nextUrl.searchParams.get('employee_id');
  const weekStart = request.nextUrl.searchParams.get('week_start');
  const limit = request.nextUrl.searchParams.get('limit');

  let sql = `
    SELECT p.*, e.name as employee_name, e.role as employee_role
    FROM payroll_entries p
    JOIN employees e ON e.id = p.employee_id
  `;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (employeeId) {
    conditions.push(`p.employee_id = $${params.length + 1}`);
    params.push(employeeId);
  }

  if (weekStart) {
    conditions.push(`p.week_start = $${params.length + 1}`);
    params.push(weekStart);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY p.week_start DESC, e.name ASC';

  if (limit) {
    sql += ` LIMIT ${parseInt(limit)}`;
  }

  return NextResponse.json(await query(sql, params));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const {
    employee_id,
    week_start,
    week_end,
    pay_date,
    travel_hours = 0,
    job_hours = 0,
    warehouse_hours = 0,
    hourly_rate,
    lunch_reimbursement = 0,
    mileage_reimbursement = 0,
    other_reimbursement = 0,
    tip = 0,
    notes = null,
  } = body;

  if (!employee_id || !week_start || !week_end || !pay_date || hourly_rate == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const total_hours = Number(travel_hours) + Number(job_hours) + Number(warehouse_hours);
  const gross_pay = total_hours * Number(hourly_rate);

  const row = await queryOne(
    `INSERT INTO payroll_entries (
      employee_id, week_start, week_end, pay_date,
      travel_hours, job_hours, warehouse_hours, total_hours,
      hourly_rate, gross_pay,
      lunch_reimbursement, mileage_reimbursement, other_reimbursement, tip, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (employee_id, week_start) DO UPDATE SET
      week_end = EXCLUDED.week_end,
      pay_date = EXCLUDED.pay_date,
      travel_hours = EXCLUDED.travel_hours,
      job_hours = EXCLUDED.job_hours,
      warehouse_hours = EXCLUDED.warehouse_hours,
      total_hours = EXCLUDED.total_hours,
      hourly_rate = EXCLUDED.hourly_rate,
      gross_pay = EXCLUDED.gross_pay,
      lunch_reimbursement = EXCLUDED.lunch_reimbursement,
      mileage_reimbursement = EXCLUDED.mileage_reimbursement,
      other_reimbursement = EXCLUDED.other_reimbursement,
      tip = EXCLUDED.tip,
      notes = EXCLUDED.notes
    RETURNING *`,
    [
      employee_id, week_start, week_end, pay_date,
      travel_hours, job_hours, warehouse_hours, total_hours,
      hourly_rate, gross_pay,
      lunch_reimbursement, mileage_reimbursement, other_reimbursement, tip, notes,
    ]
  );

  return NextResponse.json(row, { status: 201 });
}
