import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { addDays, format } from 'date-fns';
import { requireBackOffice } from '@/lib/auth';
import { query } from '@/lib/db';
import { weekStartOf } from '@/lib/bonus';
import { parseRawPayrollReport, aggregateByEmployee } from '@/lib/payroll-report-import';
import { computeWeeklyPay, WAREHOUSE_HOURS_PER_DAY } from '@/lib/payroll-compute';

// Import the raw SmartMoving payroll DETAIL report (one row per employee/job/day),
// aggregate it to a weekly per-employee summary, compute warehouse (0.5/job-day minus
// lateness) + overtime, and upsert into payroll_entries — the weekly source the bonus
// engine and the Payroll Run read from. Marketing hours + bonus are layered on later
// (marketing via its own entry; bonus from the weekly bonus engine at view time).
export const maxDuration = 300;

interface EmpRow {
  id: string;
  name: string;
  aliases: string[] | null;
  hourly_rate: string | null;
  classification: string | null;
  is_active: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  let rows;
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    });
    rows = parseRawPayrollReport(matrix).rows;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No data rows found. Is this the SmartMoving payroll detail report?' },
      { status: 400 }
    );
  }

  // The pay week comes from the report's job dates (Mon–Sun).
  const jobDates = rows.map((r) => r.date).filter((d): d is string => !!d).sort();
  if (jobDates.length === 0) {
    return NextResponse.json({ error: 'No dated rows in the report.' }, { status: 400 });
  }
  const periodStart = jobDates[0];
  const periodEnd = jobDates[jobDates.length - 1];
  const weekStart = weekStartOf(periodStart);
  const weekEnd = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  // Check date = the Friday of the second following week (period start + 11 days).
  const payDate = format(addDays(new Date(`${weekStart}T12:00:00`), 11), 'yyyy-MM-dd');

  // Resolve report names (incl. sales aliases) to employees.
  //
  // Some people have more than one active row (e.g. a crew record plus a later
  // manager record with a company email). The map is keyed by name, so without a
  // deterministic order the winner varied between imports — and picking the newer,
  // empty record would drop that person out of the ADP tables. Order so the best
  // candidate is written LAST and therefore wins: active over inactive, classified
  // over unclassified, then oldest first (the record carrying the pay history).
  const employees = await query<EmpRow>(
    `SELECT id, name, aliases, hourly_rate, classification, is_active
       FROM employees
      ORDER BY is_active ASC, (classification IS NOT NULL) ASC, created_at DESC`
  );
  const byName = new Map<string, EmpRow>();
  for (const e of employees) {
    byName.set(e.name.trim().toLowerCase(), e);
    for (const a of e.aliases ?? []) byName.set(String(a).trim().toLowerCase(), e);
  }
  const resolve = (name: string): EmpRow | null => byName.get(name.trim().toLowerCase()) ?? null;

  // Names in the report that don't match any employee — reported, not imported.
  const unmatched = Array.from(
    new Set(rows.map((r) => r.name).filter((n) => n && !resolve(n)))
  );

  const aggregates = aggregateByEmployee(rows, (name) => resolve(name)?.id ?? null);
  const empById = new Map(employees.map((e) => [e.id, e]));

  // Lateness per (employee, day) for the warehouse computation.
  const attendance = await query<{ employee_id: string; date: string; late_minutes: number }>(
    'SELECT employee_id, date::text AS date, COALESCE(late_minutes, 0) AS late_minutes FROM attendance WHERE date >= $1 AND date <= $2',
    [weekStart, weekEnd]
  );
  const lateBy = new Map<string, number>(); // `${empId}|${date}` → minutes
  for (const a of attendance) lateBy.set(`${a.employee_id}|${a.date}`, Number(a.late_minutes));

  let imported = 0;
  const flags: string[] = [];

  for (const agg of aggregates) {
    const emp = empById.get(agg.key);
    if (!emp) continue;

    // Warehouse = 0.5h per job-day minus that day's lateness, floored at 0.
    let warehouse = 0;
    for (const day of agg.jobDays) {
      const late = lateBy.get(`${emp.id}|${day}`) ?? 0;
      warehouse += Math.max(0, WAREHOUSE_HOURS_PER_DAY - late / 60);
    }

    const rate = agg.standardRate || Number(emp.hourly_rate ?? 0) || 0;
    const pay = computeWeeklyPay({
      jobHours: agg.jobHours,
      jobDayCount: agg.jobDays.length,
      standardRate: rate,
      marketingHours: 0, // layered on via the marketing entry
      warehouseHoursOverride: round2(warehouse),
      tips: agg.tips,
      commissions: agg.commissions,
      bonus: 0, // the weekly bonus engine supplies this at view time
      miles: 0,
    });

    try {
      await query(
        `INSERT INTO payroll_entries (
           employee_id, week_start, week_end, pay_date, period_start, period_end, source_file,
           billable_hours, warehouse_hours, marketing_hours, total_hours, overtime_hours,
           hourly_rate, standard_pay, overtime_rate, overtime_pay, gross_pay,
           tip, commissions, miles, total_compensation, job_hours, travel_hours,
           lunch_reimbursement, mileage_reimbursement, other_reimbursement
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,
           $8,$9,0,$10,$11,
           $12,$13,$14,$15,$16,
           $17,$18,0,$19,$20,0,
           0,0,0
         )
         ON CONFLICT (employee_id, week_start) DO UPDATE SET
           week_end = EXCLUDED.week_end, pay_date = EXCLUDED.pay_date,
           period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
           source_file = EXCLUDED.source_file,
           billable_hours = EXCLUDED.billable_hours, warehouse_hours = EXCLUDED.warehouse_hours,
           total_hours = EXCLUDED.total_hours, overtime_hours = EXCLUDED.overtime_hours,
           hourly_rate = EXCLUDED.hourly_rate, standard_pay = EXCLUDED.standard_pay,
           overtime_rate = EXCLUDED.overtime_rate, overtime_pay = EXCLUDED.overtime_pay,
           gross_pay = EXCLUDED.gross_pay, tip = EXCLUDED.tip, commissions = EXCLUDED.commissions,
           total_compensation = EXCLUDED.total_compensation, job_hours = EXCLUDED.job_hours`,
        [
          emp.id, weekStart, weekEnd, payDate, periodStart, periodEnd, file.name,
          round2(agg.jobHours), round2(warehouse), pay.totalHours, pay.overtimeHours,
          rate, pay.standardPay, round2(rate / 2), pay.overtimePay, round2(pay.standardPay + pay.overtimePay),
          round2(agg.tips), round2(agg.commissions), pay.totalCompensation, round2(agg.jobHours),
        ]
      );
      imported++;
    } catch (err) {
      flags.push(`${emp.name}: could not save (${err instanceof Error ? err.message : 'error'})`);
      continue;
    }

    // Audit checks (mirror the spreadsheet's data-validation column).
    if (emp.is_active && !emp.classification) flags.push(`${emp.name}: no W-2/1099 classification (won't pull into ADP)`);
    if (pay.totalHours > 80) flags.push(`${emp.name}: ${pay.totalHours} hours > 80 — check the report`);
    if (agg.rates.length > 1) flags.push(`${emp.name}: multiple pay rates (${agg.rates.join(' / ')})`);
    if (rate === 0) flags.push(`${emp.name}: $0 hourly rate`);
  }

  return NextResponse.json({
    imported,
    unmatched,
    weekStart,
    period: { start: periodStart, end: periodEnd },
    flags,
  });
}
