import { query } from '@/lib/db';
import { positiveLabel, strikeLabel } from '@/lib/bonus';

/**
 * Unified export of everything that affects pay or standing, filtered by EFFECTIVE
 * (record) date — the day it was logged, which is the pay period it's paid in.
 * Lateness (unpaid minutes) plus every positive, GG Point, strike, and write-up.
 * Each row carries both the job date (when it happened) and the effective date.
 */
export interface ExportRow {
  effectiveDate: string;
  jobDate: string;
  employee: string;
  category: 'Lateness' | 'Positive' | 'GG Point' | 'Strike' | 'Write-Up';
  detail: string;
  scheduledStart: string;
  arrival: string;
  minutesLate: number | '';
  hoursDeduction: number | '';
  bonusImpact: string;
  note: string;
}

export async function getEventsExport(start: string, end: string): Promise<ExportRow[]> {
  const [lateness, positives, strikes, writeUps] = await Promise.all([
    // Lateness is recorded the day it happens, so it filters on the attendance date.
    query<{
      date: string;
      name: string;
      scheduled_start: string | null;
      arrival_time: string | null;
      late_minutes: number;
      notes: string | null;
    }>(
      `SELECT a.date::text, e.name, a.scheduled_start::text, a.arrival_time::text,
              a.late_minutes, a.notes
         FROM attendance a JOIN employees e ON e.id = a.employee_id
        WHERE a.date >= $1 AND a.date <= $2 AND a.late_minutes > 0
        ORDER BY a.date, e.name`,
      [start, end]
    ),
    query<{ effective: string; event: string; name: string; type: string; note: string | null; discretionary: boolean }>(
      `SELECT p.effective_date::text AS effective, p.event_date::text AS event, e.name, p.type, p.note, p.discretionary
         FROM bonus_positives p JOIN employees e ON e.id = p.employee_id
        WHERE p.effective_date >= $1 AND p.effective_date <= $2`,
      [start, end]
    ),
    query<{
      effective: string;
      event: string;
      name: string;
      type: string;
      arrival_time: string | null;
      note: string | null;
      voided: boolean;
      void_reason: string | null;
    }>(
      `SELECT s.effective_date::text AS effective, s.event_date::text AS event, e.name, s.type,
              s.arrival_time::text, s.note, s.voided, s.void_reason
         FROM bonus_strikes s JOIN employees e ON e.id = s.employee_id
        WHERE s.effective_date >= $1 AND s.effective_date <= $2`,
      [start, end]
    ),
    query<{ effective: string; event: string; name: string; summary: string; source: string }>(
      `SELECT w.effective_date::text AS effective, w.event_date::text AS event, e.name, w.summary, w.source
         FROM write_ups w JOIN employees e ON e.id = w.employee_id
        WHERE w.effective_date >= $1 AND w.effective_date <= $2`,
      [start, end]
    ),
  ]);

  const rows: ExportRow[] = [];

  for (const l of lateness) {
    rows.push({
      effectiveDate: l.date,
      jobDate: l.date,
      employee: l.name,
      category: 'Lateness',
      detail: 'Late arrival (unpaid)',
      scheduledStart: l.scheduled_start ?? '',
      arrival: l.arrival_time ?? '',
      minutesLate: l.late_minutes,
      hoursDeduction: Math.round((l.late_minutes / 60) * 100) / 100,
      bonusImpact: '',
      note: l.notes ?? '',
    });
  }

  for (const p of positives) {
    const gg = p.discretionary;
    rows.push({
      effectiveDate: p.effective,
      jobDate: p.event,
      employee: p.name,
      category: gg ? 'GG Point' : 'Positive',
      detail: positiveLabel(p.type),
      scheduledStart: '',
      arrival: '',
      minutesLate: '',
      hoursDeduction: '',
      bonusImpact: gg ? '+0.5× (strike-proof)' : '+0.5×',
      note: p.note ?? '',
    });
  }

  for (const s of strikes) {
    rows.push({
      effectiveDate: s.effective,
      jobDate: s.event,
      employee: s.name,
      category: 'Strike',
      detail: strikeLabel(s.type),
      scheduledStart: '',
      arrival: s.arrival_time ?? '',
      minutesLate: '',
      hoursDeduction: '',
      bonusImpact: s.voided ? 'voided' : 'forfeits weekly bonus',
      note: s.voided && s.void_reason ? `Voided: ${s.void_reason}` : s.note ?? '',
    });
  }

  for (const w of writeUps) {
    rows.push({
      effectiveDate: w.effective,
      jobDate: w.event,
      employee: w.name,
      category: 'Write-Up',
      detail: w.source === 'auto' ? 'Write-Up (auto)' : 'Write-Up',
      scheduledStart: '',
      arrival: '',
      minutesLate: '',
      hoursDeduction: '',
      bonusImpact: '',
      note: w.summary,
    });
  }

  rows.sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.employee.localeCompare(b.employee)
  );
  return rows;
}
