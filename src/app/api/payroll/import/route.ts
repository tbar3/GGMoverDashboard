import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireBackOffice } from '@/lib/auth';
import { query } from '@/lib/db';
import { weekStartOf } from '@/lib/bonus';
import { parsePayrollSummary } from '@/lib/payroll-import';

// Dedicated importer for the weekly "Payroll Summary" export. The generic /api/import
// reads row-1 headers, which this header-block file breaks — so it gets its own route.
export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  let parsed;
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    });
    parsed = parsePayrollSummary(matrix);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    );
  }

  if (!parsed.periodStart) {
    return NextResponse.json(
      { error: 'Could not read the pay-period dates. Is this the Payroll Summary export?', warnings: parsed.warnings },
      { status: 400 }
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: 'No employee rows found in the file.', warnings: parsed.warnings }, { status: 400 });
  }

  const weekStart = weekStartOf(parsed.periodStart);
  const weekEnd = parsed.periodEnd;
  const payDate = parsed.checkDate;

  const employees = await query<{ id: string; name: string }>('SELECT id, name FROM employees');
  const byName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e.id]));

  let imported = 0;
  const unmatched: string[] = [];

  for (const r of parsed.rows) {
    const empId = byName.get(r.name.trim().toLowerCase());
    if (!empId) {
      unmatched.push(r.name);
      continue;
    }
    try {
      await query(
        `INSERT INTO payroll_entries (
           employee_id, week_start, week_end, pay_date, period_start, period_end, source_file,
           billable_hours, warehouse_hours, marketing_hours, total_hours, overtime_hours,
           hourly_rate, standard_pay, overtime_rate, overtime_pay, gross_pay,
           tip, bonus_amount, commissions, lunch_reimbursement, miles, total_compensation,
           job_hours, travel_hours, mileage_reimbursement, other_reimbursement
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,$12,
           $13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23,
           $24,0,0,0
         )
         ON CONFLICT (employee_id, week_start) DO UPDATE SET
           week_end = EXCLUDED.week_end, pay_date = EXCLUDED.pay_date,
           period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
           source_file = EXCLUDED.source_file,
           billable_hours = EXCLUDED.billable_hours, warehouse_hours = EXCLUDED.warehouse_hours,
           marketing_hours = EXCLUDED.marketing_hours, total_hours = EXCLUDED.total_hours,
           overtime_hours = EXCLUDED.overtime_hours, hourly_rate = EXCLUDED.hourly_rate,
           standard_pay = EXCLUDED.standard_pay, overtime_rate = EXCLUDED.overtime_rate,
           overtime_pay = EXCLUDED.overtime_pay, gross_pay = EXCLUDED.gross_pay,
           tip = EXCLUDED.tip, bonus_amount = EXCLUDED.bonus_amount,
           commissions = EXCLUDED.commissions, lunch_reimbursement = EXCLUDED.lunch_reimbursement,
           miles = EXCLUDED.miles, total_compensation = EXCLUDED.total_compensation,
           job_hours = EXCLUDED.job_hours`,
        [
          empId, weekStart, weekEnd, payDate, parsed.periodStart, parsed.periodEnd, file.name,
          r.billableHours, r.warehouseHours, r.marketingHours, r.totalHours, r.overtimeHours,
          r.standardRate, r.standardPay, r.overtimeRate, r.overtimePay, r.standardPay + r.overtimePay,
          r.tips, r.bonus, r.commissions, r.lunch, r.miles, r.totalCompensation,
          r.billableHours,
        ]
      );
      imported++;
    } catch (err) {
      unmatched.push(`${r.name} (error: ${err instanceof Error ? err.message : 'unknown'})`);
    }
  }

  return NextResponse.json({
    imported,
    unmatched,
    total: parsed.rows.length,
    weekStart,
    period: { start: parsed.periodStart, end: parsed.periodEnd, payDate: parsed.checkDate },
    warnings: parsed.warnings,
  });
}
