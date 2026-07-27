'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { weekStartOf, getWeekBoard, getBonusConfig, POSITIVE_TYPES, STRIKE_TYPES } from '@/lib/bonus';

// Performance / weekly-bonus event logging (back office only). Positives, strikes,
// and write-ups are the inputs to the weekly bonus multiplier.

type Result = { ok: boolean; error?: string };

const POSITIVE_SET = new Set<string>(POSITIVE_TYPES.map((p) => p.value));
const STRIKE_SET = new Set<string>(STRIKE_TYPES.map((s) => s.value));

function validDate(raw: string): string | null {
  // Expect yyyy-MM-dd; reject anything else so week_start is never garbage.
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function logPositive(input: {
  employeeId: string;
  type: string;
  eventDate: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!POSITIVE_SET.has(input.type)) return { ok: false, error: 'Unknown positive type' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };

  await query(
    `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, note, source, created_by)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6)`,
    [input.employeeId, weekStartOf(date), input.type, date, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

/** A discretionary GG Point (+0.5×) that survives strikes (until the forfeit threshold). */
export async function logGGPoint(input: {
  employeeId: string;
  eventDate: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };

  await query(
    `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, note, source, created_by, discretionary)
     VALUES ($1, $2, 'GG_POINT', $3, $4, 'manual', $5, TRUE)`,
    [input.employeeId, weekStartOf(date), date, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

export async function logStrike(input: {
  employeeId: string;
  type: string;
  eventDate: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!STRIKE_SET.has(input.type)) return { ok: false, error: 'Unknown strike type' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };

  const weekStart = weekStartOf(date);
  await query(
    `INSERT INTO bonus_strikes (employee_id, week_start, type, event_date, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.employeeId, weekStart, input.type, date, input.note?.trim() || null, guard.employee.id]
  );

  // Policy: 3 active strikes in a week auto-generates a write-up (one per week).
  await maybeAutoWriteUp(input.employeeId, weekStart, date, guard.employee.id);

  revalidatePath('/admin/performance');
  return { ok: true };
}

/**
 * When a crew member reaches the weekly strike threshold, the system files a
 * write-up automatically. Deduped to one auto write-up per employee per week so
 * a 4th strike doesn't stack a second one.
 */
async function maybeAutoWriteUp(
  employeeId: string,
  weekStart: string,
  date: string,
  createdBy: string
): Promise<void> {
  const config = await getBonusConfig();
  const threshold = Math.max(1, Math.round(config.forfeitThreshold));

  const counts = await queryOne<{ strikes: number; autos: number }>(
    `SELECT
        (SELECT COUNT(*)::int FROM bonus_strikes
           WHERE employee_id = $1 AND week_start = $2 AND voided = FALSE) AS strikes,
        (SELECT COUNT(*)::int FROM write_ups
           WHERE employee_id = $1 AND week_start = $2 AND source = 'auto') AS autos`,
    [employeeId, weekStart]
  );
  if (!counts) return;
  if (counts.strikes < threshold || counts.autos > 0) return;

  await query(
    `INSERT INTO write_ups (employee_id, week_start, event_date, summary, source, created_by)
     VALUES ($1, $2, $3, $4, 'auto', $5)`,
    [
      employeeId,
      weekStart,
      date,
      `Automatic write-up: reached ${threshold} strikes in the week of ${weekStart}.`,
      createdBy,
    ]
  );
}

export async function logWriteUp(input: {
  employeeId: string;
  eventDate: string;
  summary: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const summary = input.summary.trim();
  if (!summary) return { ok: false, error: 'A write-up needs a summary' };

  await query(
    `INSERT INTO write_ups (employee_id, week_start, event_date, summary, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.employeeId, weekStartOf(date), date, summary, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

/**
 * Apply one event to every crew member on a job at once — e.g. "Truck Not Ready"
 * or a whole-crew 5-Star Review — instead of logging it person by person. The
 * caller passes the (possibly edited) crew list, so a missed-sync roster can be
 * corrected before logging; that corrected roster is also saved back to the job.
 */
export async function logGroupEvent(input: {
  jobId: string;
  employeeIds: string[];
  kind: 'positive' | 'discretionary' | 'strike';
  type?: string;
  eventDate: string;
  note?: string;
  saveCrew?: boolean; // persist the edited crew back to the job (default true)
}): Promise<Result & { count?: number }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.jobId) return { ok: false, error: 'Pick a job' };

  if (input.kind === 'positive' && !POSITIVE_SET.has(input.type ?? '')) {
    return { ok: false, error: 'Unknown positive type' };
  }
  if (input.kind === 'strike' && !STRIKE_SET.has(input.type ?? '')) {
    return { ok: false, error: 'Unknown strike type' };
  }

  const crew = Array.from(new Set((input.employeeIds ?? []).filter(Boolean)));
  if (crew.length === 0) return { ok: false, error: 'Add at least one crew member' };

  // Persist the corrected roster back to the job so the fix sticks everywhere.
  if (input.saveCrew !== false) {
    await query('UPDATE jobs SET crew_ids = $2 WHERE id = $1', [input.jobId, crew]);
  }

  const weekStart = weekStartOf(date);
  const note = input.note?.trim() || null;

  for (const employeeId of crew) {
    if (input.kind === 'strike') {
      await query(
        `INSERT INTO bonus_strikes (employee_id, week_start, type, event_date, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [employeeId, weekStart, input.type, date, note, guard.employee.id]
      );
      await maybeAutoWriteUp(employeeId, weekStart, date, guard.employee.id);
    } else if (input.kind === 'discretionary') {
      await query(
        `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, note, source, created_by, discretionary)
         VALUES ($1, $2, 'GG_POINT', $3, $4, 'group', $5, TRUE)`,
        [employeeId, weekStart, date, note, guard.employee.id]
      );
    } else {
      await query(
        `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, note, source, created_by)
         VALUES ($1, $2, $3, $4, $5, 'group', $6)`,
        [employeeId, weekStart, input.type, date, note, guard.employee.id]
      );
    }
  }

  revalidatePath('/admin/performance');
  return { ok: true, count: crew.length };
}

/** Save a corrected crew roster to a job (e.g. when the calendar sync missed someone). */
export async function saveJobCrew(jobId: string, employeeIds: string[]): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!jobId) return { ok: false, error: 'Pick a job' };
  const crew = Array.from(new Set((employeeIds ?? []).filter(Boolean)));
  await query('UPDATE jobs SET crew_ids = $2 WHERE id = $1', [jobId, crew]);
  revalidatePath('/admin/performance');
  return { ok: true };
}

export async function voidStrike(strikeId: string, reason: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const r = reason.trim();
  if (!r) return { ok: false, error: 'A void needs a reason' };
  const row = await queryOne<{ employee_id: string; week_start: string }>(
    `UPDATE bonus_strikes SET voided = TRUE, void_reason = $2
      WHERE id = $1 AND voided = FALSE
      RETURNING employee_id, week_start::text`,
    [strikeId, r]
  );

  // If voiding drops the week back under the threshold, retract the auto write-up.
  if (row) {
    const config = await getBonusConfig();
    const threshold = Math.max(1, Math.round(config.forfeitThreshold));
    const active = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM bonus_strikes
        WHERE employee_id = $1 AND week_start = $2 AND voided = FALSE`,
      [row.employee_id, row.week_start]
    );
    if ((active?.n ?? 0) < threshold) {
      await query(
        `DELETE FROM write_ups WHERE employee_id = $1 AND week_start = $2 AND source = 'auto'`,
        [row.employee_id, row.week_start]
      );
    }
  }

  revalidatePath('/admin/performance');
  return { ok: true };
}

export async function deletePositive(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM bonus_positives WHERE id = $1', [id]);
  revalidatePath('/admin/performance');
  return { ok: true };
}

// ── Week close / lifecycle ────────────────────────────────────

function validWeek(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStartOf(raw) : null;
}

/**
 * Lock a week: snapshot every employee's computed result into bonus_week_results
 * and mark the week approved. Re-approving refreshes the snapshot.
 */
export async function approveWeek(weekStartRaw: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const weekStart = validWeek(weekStartRaw);
  if (!weekStart) return { ok: false, error: 'Invalid week' };

  const board = await getWeekBoard(weekStart);
  // Only snapshot people who have something for the week (hours or events) —
  // an empty $0 row for everyone else is just noise on the export.
  const rows = board.filter(
    (b) =>
      b.result.hours > 0 ||
      b.events.positives.length > 0 ||
      b.events.strikes.length > 0 ||
      b.events.writeUps.length > 0
  );

  await query('DELETE FROM bonus_week_results WHERE week_start = $1', [weekStart]);
  for (const b of rows) {
    await query(
      `INSERT INTO bonus_week_results
         (week_start, employee_id, hours, positives_count, perfect_week, multiplier, has_strike, bonus, locked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        weekStart,
        b.employeeId,
        b.result.hours,
        b.result.positivesCount,
        b.result.perfectWeek,
        b.result.multiplier,
        b.result.hasStrike,
        b.result.bonus,
        guard.employee.id,
      ]
    );
  }

  await query(
    `INSERT INTO bonus_weeks (week_start, status, approved_by, approved_at)
     VALUES ($1, 'approved', $2, NOW())
     ON CONFLICT (week_start) DO UPDATE SET status = 'approved', approved_by = $2, approved_at = NOW()`,
    [weekStart, guard.employee.id]
  );

  revalidatePath('/admin/performance');
  return { ok: true };
}

/** Reopen an approved week for editing (clears the frozen snapshot; keeps adjustments). */
export async function reopenWeek(weekStartRaw: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const weekStart = validWeek(weekStartRaw);
  if (!weekStart) return { ok: false, error: 'Invalid week' };

  await query('DELETE FROM bonus_week_results WHERE week_start = $1', [weekStart]);
  await query(`UPDATE bonus_weeks SET status = 'open', approved_by = NULL, approved_at = NULL WHERE week_start = $1`, [weekStart]);
  revalidatePath('/admin/performance');
  return { ok: true };
}

/** Post-lock correction: a signed delta + reason, shown on the next export. */
export async function addAdjustment(input: {
  weekStart: string;
  employeeId: string;
  delta: string;
  reason: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const weekStart = validWeek(input.weekStart);
  if (!weekStart) return { ok: false, error: 'Invalid week' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const delta = parseFloat(String(input.delta).replace(/[$,]/g, ''));
  if (isNaN(delta) || delta === 0) return { ok: false, error: 'Enter a non-zero amount' };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'An adjustment needs a reason' };

  const wk = await queryOne<{ status: string }>('SELECT status FROM bonus_weeks WHERE week_start = $1', [weekStart]);
  if (wk?.status !== 'approved') return { ok: false, error: 'Approve the week before adjusting it' };

  await query(
    `INSERT INTO bonus_adjustments (week_start, employee_id, delta, reason, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [weekStart, input.employeeId, delta, reason, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

export async function deleteAdjustment(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM bonus_adjustments WHERE id = $1', [id]);
  revalidatePath('/admin/performance');
  return { ok: true };
}
