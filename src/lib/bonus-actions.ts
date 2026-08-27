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

// Effective (record) date drives the pay-period export; defaults to today when
// the caller doesn't supply one.
function effectiveOf(raw: string | undefined, fallback: string): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function validArrival(raw: string | undefined): string | null {
  return raw && /^\d{2}:\d{2}(:\d{2})?$/.test(raw) ? raw : null;
}

export async function logPositive(input: {
  employeeId: string;
  type: string;
  eventDate: string;
  effectiveDate?: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!POSITIVE_SET.has(input.type)) return { ok: false, error: 'Unknown positive type' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const effective = effectiveOf(input.effectiveDate, todayStr());

  // The bonus week follows the EFFECTIVE (record) date — an event noticed later
  // counts against the week we log it in.
  await query(
    `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, effective_date, note, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)`,
    [input.employeeId, weekStartOf(effective), input.type, date, effective, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

/** A discretionary GG Point (+0.5×) that survives strikes (until the forfeit threshold). */
export async function logGGPoint(input: {
  employeeId: string;
  eventDate: string;
  effectiveDate?: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const effective = effectiveOf(input.effectiveDate, todayStr());

  await query(
    `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, effective_date, note, source, created_by, discretionary)
     VALUES ($1, $2, 'GG_POINT', $3, $4, $5, 'manual', $6, TRUE)`,
    [input.employeeId, weekStartOf(effective), date, effective, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
}

export async function logStrike(input: {
  employeeId: string;
  type: string;
  eventDate: string;
  effectiveDate?: string;
  arrivalTime?: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!STRIKE_SET.has(input.type)) return { ok: false, error: 'Unknown strike type' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const effective = effectiveOf(input.effectiveDate, todayStr());
  const arrival = input.type === 'LATE' ? validArrival(input.arrivalTime) : null;

  // The bonus week follows the EFFECTIVE (record) date.
  const weekStart = weekStartOf(effective);
  await query(
    `INSERT INTO bonus_strikes (employee_id, week_start, type, event_date, effective_date, arrival_time, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.employeeId, weekStart, input.type, date, effective, arrival, input.note?.trim() || null, guard.employee.id]
  );

  // A Late strike with an arrival time also feeds attendance lateness tracking,
  // recorded on the actual day worked (the job date).
  if (arrival) await recordLateArrival(input.employeeId, date, arrival);

  // Policy: 3 active strikes in a week auto-generates a write-up (one per week).
  await maybeAutoWriteUp(input.employeeId, weekStart, date, guard.employee.id);

  revalidatePath('/admin/performance');
  return { ok: true };
}

/** yyyy-MM-dd for "today" in the server's local time. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Upsert an attendance row from a logged Late arrival so the unpaid-minutes
 * deduction stays in sync. Scheduled start defaults to the 7:15 call.
 */
async function recordLateArrival(employeeId: string, date: string, arrival: string): Promise<void> {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const scheduled = '07:15';
  const lateMinutes = Math.max(0, toMin(arrival) - toMin(scheduled));
  await query(
    `INSERT INTO attendance (employee_id, date, arrival_time, scheduled_start, late_minutes, is_tardy)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, date)
     DO UPDATE SET arrival_time = $3,
                   late_minutes = GREATEST(0, EXTRACT(EPOCH FROM ($3::time - attendance.scheduled_start)) / 60)::int,
                   is_tardy = ($3::time > attendance.scheduled_start)`,
    [employeeId, date, arrival, scheduled, lateMinutes, lateMinutes > 0]
  );
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
    `INSERT INTO write_ups (employee_id, week_start, event_date, effective_date, summary, source, created_by)
     VALUES ($1, $2, $3, $4, $5, 'auto', $6)`,
    [
      employeeId,
      weekStart,
      date,
      todayStr(),
      `Automatic write-up: reached ${threshold} strikes in the week of ${weekStart}.`,
      createdBy,
    ]
  );
}

export async function logWriteUp(input: {
  employeeId: string;
  eventDate: string;
  effectiveDate?: string;
  summary: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const date = validDate(input.eventDate);
  if (!date) return { ok: false, error: 'Pick a valid date' };
  if (!input.employeeId) return { ok: false, error: 'Pick a crew member' };
  const summary = input.summary.trim();
  if (!summary) return { ok: false, error: 'A write-up needs a summary' };
  const effective = effectiveOf(input.effectiveDate, todayStr());

  await query(
    `INSERT INTO write_ups (employee_id, week_start, event_date, effective_date, summary, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.employeeId, weekStartOf(effective), date, effective, summary, guard.employee.id]
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
  effectiveDate?: string;
  arrivalTime?: string;
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

  const effective = effectiveOf(input.effectiveDate, todayStr());
  // The bonus week follows the EFFECTIVE (record) date, not the job date.
  const weekStart = weekStartOf(effective);
  const arrival = input.type === 'LATE' ? validArrival(input.arrivalTime) : null;
  const note = input.note?.trim() || null;

  for (const employeeId of crew) {
    if (input.kind === 'strike') {
      await query(
        `INSERT INTO bonus_strikes (employee_id, week_start, type, event_date, effective_date, arrival_time, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [employeeId, weekStart, input.type, date, effective, arrival, note, guard.employee.id]
      );
      if (arrival) await recordLateArrival(employeeId, date, arrival);
      await maybeAutoWriteUp(employeeId, weekStart, date, guard.employee.id);
    } else if (input.kind === 'discretionary') {
      await query(
        `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, effective_date, note, source, created_by, discretionary)
         VALUES ($1, $2, 'GG_POINT', $3, $4, $5, 'group', $6, TRUE)`,
        [employeeId, weekStart, date, effective, note, guard.employee.id]
      );
    } else {
      await query(
        `INSERT INTO bonus_positives (employee_id, week_start, type, event_date, effective_date, note, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'group', $7)`,
        [employeeId, weekStart, input.type, date, effective, note, guard.employee.id]
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

  const [board, config] = await Promise.all([getWeekBoard(weekStart), getBonusConfig()]);
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
         (week_start, employee_id, hours, positives_count, perfect_week, multiplier, has_strike, bonus, locked_by,
          base_rate, base_multiplier, discretionary_count, auto_bonus, strike_count, gross_multiplier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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
        // Freeze the inputs, not just the answer, so the week's report can always
        // show the arithmetic even after settings or skills change.
        config.baseRate,
        b.result.baseMultiplier,
        b.result.discretionaryCount,
        b.result.autoBonus,
        b.result.strikeCount,
        b.result.grossMultiplier,
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
