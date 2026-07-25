import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { getWeekStatus, getWeekResults, getWeekAdjustments, weekStartOf } from '@/lib/bonus';
import { addDays, format } from 'date-fns';

// Payroll export for a locked week: one line per employee (employee, week ending,
// hours, multiplier, bonus), plus a line per post-lock adjustment.
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

  const [results, adjustments] = await Promise.all([
    getWeekResults(weekStart),
    getWeekAdjustments(weekStart),
  ]);

  const weekEnding = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [['Employee', 'Week Ending', 'Bonus Hours', 'Multiplier', 'Bonus', 'Type', 'Reason'].join(',')];
  for (const r of results) {
    lines.push(
      [
        esc(r.name),
        weekEnding,
        r.hours.toFixed(2),
        r.hasStrike ? '0' : r.multiplier.toString(),
        r.bonus.toFixed(2),
        r.hasStrike ? 'bonus (forfeited)' : 'bonus',
        '',
      ].join(',')
    );
  }
  for (const a of adjustments) {
    lines.push([esc(a.name), weekEnding, '', '', a.delta.toFixed(2), 'adjustment', esc(a.reason)].join(','));
  }

  const csv = lines.join('\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bonus-${weekStart}.csv"`,
    },
  });
}
