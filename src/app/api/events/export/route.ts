import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getEventsExport } from '@/lib/events-export';

// Combined time + events export over a date range: lateness (unpaid minutes) plus
// every positive, GG Point, strike, and write-up. CSV, one row per event.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const start = request.nextUrl.searchParams.get('start');
  const end = request.nextUrl.searchParams.get('end');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!start || !end || !re.test(start) || !re.test(end)) {
    return NextResponse.json({ error: 'Pass ?start=YYYY-MM-DD&end=YYYY-MM-DD' }, { status: 400 });
  }

  const rows = await getEventsExport(start, end);

  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Effective Date',
    'Job Date',
    'Employee',
    'Category',
    'Detail',
    'Scheduled Start',
    'Arrival',
    'Minutes Late',
    'Hours Deduction',
    'Bonus Impact',
    'Note',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.effectiveDate,
        r.jobDate,
        esc(r.employee),
        r.category,
        esc(r.detail),
        r.scheduledStart,
        r.arrival,
        r.minutesLate === '' ? '' : r.minutesLate,
        r.hoursDeduction === '' ? '' : r.hoursDeduction,
        esc(r.bonusImpact),
        esc(r.note),
      ].join(',')
    );
  }

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="events-${start}_to_${end}.csv"`,
    },
  });
}
