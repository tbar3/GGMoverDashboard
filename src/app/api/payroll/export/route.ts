import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getPayrollRun } from '@/lib/payroll-run';

// Download an ADP-ready CSV for a pay week — one table per classification
// (?type=w2 | 1099). These mirror the ADP-W2 / ADP-1099 entry columns.
function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const week = request.nextUrl.searchParams.get('week');
  const type = request.nextUrl.searchParams.get('type') === '1099' ? '1099' : 'w2';
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'Pass ?week=YYYY-MM-DD' }, { status: 400 });
  }

  const run = await getPayrollRun(week);

  let header: string[];
  let rows: (string | number)[][];
  if (type === '1099') {
    header = ['Contractor', 'Comp Hours', 'Comp Amount', 'Reimbursement'];
    rows = run.contractors1099.map((r) => [r.contractor, r.compHours, r.compAmount, r.reimbursement]);
  } else {
    header = ['Employee', 'Regular Hours', 'Overtime Hours', 'Tips', 'Bonus', 'Commissions', 'Reimbursement'];
    rows = run.w2.map((r) => [r.employee, r.regularHours, r.overtimeHours, r.tips, r.bonus, r.commissions, r.reimbursement]);
  }

  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="adp-${type}-${week}.csv"`,
    },
  });
}
