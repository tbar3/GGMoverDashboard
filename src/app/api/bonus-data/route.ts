import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const [employees, damages, performanceEvents, mileageEntries, perfectWeeks] = await Promise.all([
    query('SELECT * FROM employees WHERE is_active = true'),
    query('SELECT * FROM damages WHERE created_at >= $1 AND created_at <= $2', [monthStart, monthEnd]),
    query('SELECT * FROM performance_events WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
    query('SELECT * FROM mileage_entries WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
    query('SELECT * FROM perfect_weeks WHERE week_start >= $1 AND week_end <= $2', [monthStart, monthEnd]),
  ]);

  return NextResponse.json({ employees, damages, performanceEvents, mileageEntries, perfectWeeks });
}
