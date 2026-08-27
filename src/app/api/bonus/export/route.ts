import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getWeekStatus, weekStartOf } from '@/lib/bonus';
import { getWeekBonusReport, renderWeekBonusCsv } from '@/lib/bonus-report';

// The weekly bonus report for a locked week: the rules, a reconciling summary,
// a fully itemized per-employee breakdown with the arithmetic spelled out, the
// events behind each multiplier, and the post-lock adjustment log.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const raw = request.nextUrl.searchParams.get('week');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return NextResponse.json({ error: 'Pass ?week=YYYY-MM-DD' }, { status: 400 });
  }
  const weekStart = weekStartOf(raw);

  const status = await getWeekStatus(weekStart);
  if (status.status !== 'approved') {
    return NextResponse.json({ error: 'Approve (lock) the week before exporting.' }, { status: 400 });
  }

  const report = await getWeekBonusReport(weekStart);
  const csv = renderWeekBonusCsv(report);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bonus-report-week-ending-${report.weekEnding}.csv"`,
    },
  });
}
