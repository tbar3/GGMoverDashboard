import { query } from '@/lib/db';
import { positiveLabel, strikeLabel } from '@/lib/bonus';

/**
 * Unified export of everything that affects pay or standing over a date range:
 * lateness (unpaid minutes) plus every positive, GG Point, strike, and write-up.
 * One flat row shape so it drops straight into a CSV.
 */
export interface ExportRow {
  date: string;
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
    query<{ date: string; name: string; type: string; note: string | null; discretionary: boolean }>(
      `SELECT p.event_date::text AS date, e.name, p.type, p.note, p.discretionary
         FROM bonus_positives p JOIN employees e ON e.id = p.employee_id
        WHERE p.event_date >= $1 AND p.event_date <= $2`,
      [start, end]
    ),
    query<{ date: string; name: string; type: string; note: string | null; voided: boolean; void_reason: string | null }>(
      `SELECT s.event_date::text AS date, e.name, s.type, s.note, s.voided, s.void_reason
         FROM bonus_strikes s JOIN employees e ON e.id = s.employee_id
        WHERE s.event_date >= $1 AND s.event_date <= $2`,
      [start, end]
    ),
    query<{ date: string; name: string; summary: string; source: string }>(
      `SELECT w.event_date::text AS date, e.name, w.summary, w.source
         FROM write_ups w JOIN employees e ON e.id = w.employee_id
        WHERE w.event_date >= $1 AND w.event_date <= $2`,
      [start, end]
    ),
  ]);

  const rows: ExportRow[] = [];

  for (const l of lateness) {
    rows.push({
      date: l.date,
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
      date: p.date,
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
      date: s.date,
      employee: s.name,
      category: 'Strike',
      detail: strikeLabel(s.type),
      scheduledStart: '',
      arrival: '',
      minutesLate: '',
      hoursDeduction: '',
      bonusImpact: s.voided ? 'voided' : 'forfeits weekly bonus',
      note: s.voided && s.void_reason ? `Voided: ${s.void_reason}` : s.note ?? '',
    });
  }

  for (const w of writeUps) {
    rows.push({
      date: w.date,
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

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee));
  return rows;
}
