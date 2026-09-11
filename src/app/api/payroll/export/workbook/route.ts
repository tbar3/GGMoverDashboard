import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireBackOffice } from '@/lib/auth';
import { getClosedRun, getPayrollRun, getWeekSummary } from '@/lib/payroll-run';
import { query } from '@/lib/db';

/**
 * The whole week in one file.
 *
 * A workbook rather than a single flat CSV because ADP takes W-2 and 1099 as two
 * different entry tables with different columns — flattening them into one sheet
 * would produce a file that is convenient to archive and impossible to key in. So
 * each ADP table keeps its exact shape on its own sheet, and the extra sheets
 * carry everything a CSV could not: the bonus breakdown, marketing hours, and the
 * week's totals.
 *
 * For a CLOSED week every number comes from the frozen snapshot, so re-downloading
 * this file next year returns the same figures it returns today.
 */
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const week = request.nextUrl.searchParams.get('week');
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'Pass ?week=YYYY-MM-DD' }, { status: 400 });
  }

  const [run, closed, summary] = await Promise.all([
    getPayrollRun(week),
    getClosedRun(week),
    getWeekSummary(week),
  ]);

  if (run.detail.length === 0) {
    return NextResponse.json({ error: 'No payroll rows for that week' }, { status: 404 });
  }

  const marketing = await query<{ name: string; hours: number; note: string | null }>(
    `SELECT e.name, m.hours, m.note
       FROM marketing_hours m JOIN employees e ON e.id = m.employee_id
      WHERE m.week_start = $1 ORDER BY e.name`,
    [week]
  );

  const money = (n: number) => Math.round(n * 100) / 100;
  const wb = XLSX.utils.book_new();

  // ── Summary ────────────────────────────────────────────────────────────────
  const gross = money(run.detail.reduce((t, r) => t + r.totalCompensation, 0));
  const summaryRows: (string | number | null)[][] = [
    ['Week starting', week],
    ['Pay period', `${run.periodStart ?? '—'} → ${run.periodEnd ?? '—'}`],
    ['Status', closed ? `Closed v${closed.version} by ${closed.closedByName}` : 'OPEN — figures can still change'],
    [],
    ['People paid', run.detail.length],
    ['Total hours', money(run.detail.reduce((t, r) => t + r.totalHours, 0))],
    ['Overtime hours', money(run.detail.reduce((t, r) => t + r.overtimeHours, 0))],
    [],
    ['Tips', money(run.detail.reduce((t, r) => t + r.tips, 0))],
    ['Commissions', money(run.detail.reduce((t, r) => t + r.commissions, 0))],
    ['Weekly bonus', money(run.detail.reduce((t, r) => t + r.bonus, 0))],
    ['Mileage reimbursement', money(run.detail.reduce((t, r) => t + r.miles, 0))],
    ['Gross payroll', gross],
    [],
    ['Revenue', closed?.revenue ?? summary.revenue ?? null],
    ['Labor ratio %', closed?.laborRatio != null
      ? money(closed.laborRatio * 100)
      : summary.laborRatio != null ? money(summary.laborRatio * 100) : null],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  // ── ADP sheets: exact columns ADP expects, unchanged ───────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Employee', 'Regular Hours', 'Overtime Hours', 'Tips', 'Bonus', 'Commissions', 'Reimbursement'],
      ...run.w2.map((r) => [r.employee, r.regularHours, r.overtimeHours, r.tips, r.bonus, r.commissions, r.reimbursement]),
    ]),
    'ADP W-2'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Contractor', 'Comp Hours', 'Comp Amount', 'Reimbursement'],
      ...run.contractors1099.map((r) => [r.contractor, r.compHours, r.compAmount, r.reimbursement]),
    ]),
    'ADP 1099'
  );

  // ── Full detail: every component, so the total can always be re-derived ────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Employee', 'Class', 'Billable Hrs', 'Warehouse Hrs', 'Marketing Hrs', 'Total Hrs',
       'Regular Hrs', 'OT Hrs', 'Rate', 'Weekly Salary', 'Tips', 'Commissions', 'Bonus',
       'Bonus Source', 'Mileage', 'Total Comp'],
      ...run.detail.map((r) => [
        r.name, r.classification ?? '', r.billableHours, r.warehouseHours, r.marketingHours,
        r.totalHours, r.regularHours, r.overtimeHours, r.rate, r.weeklySalary || '',
        r.tips, r.commissions, r.bonus, r.bonusSource, r.miles, r.totalCompensation,
      ]),
    ]),
    'Full Detail'
  );

  // ── Bonus detail ───────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Employee', 'Bonus', 'Source'],
      ...run.detail.filter((r) => r.bonus !== 0).map((r) => [r.name, r.bonus, r.bonusSource]),
      [],
      ['Source key', '', ''],
      ['locked', 'from the approved bonus week — cannot change', ''],
      ['live', 'bonus week still open — provisional', ''],
      ['override', 'manually overridden on the payroll run', ''],
    ]),
    'Bonus Detail'
  );

  // ── Marketing hours ────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Employee', 'Hours', 'Note'],
      ...marketing.map((m) => [m.name, Number(m.hours), m.note ?? '']),
    ]),
    'Marketing Hours'
  );

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const tag = closed ? `closed-v${closed.version}` : 'open';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll-${week}-${tag}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
