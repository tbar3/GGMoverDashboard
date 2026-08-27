import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getPayrollAudit, renderPayrollAuditCsv } from '@/lib/payroll-audit';

// The full audit pack for one pay week: provenance, reconciliation, per-employee
// derivation with a source for every input, ADP tie-out, exceptions, change log.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const week = request.nextUrl.searchParams.get('week');
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'Pass ?week=YYYY-MM-DD' }, { status: 400 });
  }

  const audit = await getPayrollAudit(week);
  return new NextResponse(renderPayrollAuditCsv(audit), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-audit-${week}.csv"`,
    },
  });
}
