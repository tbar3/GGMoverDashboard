'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { currentQuarter } from '@/lib/crew-meetings';

// Crew meeting writes — back office only. Every action self-guards; the /admin
// layout protects the page, but a server action is its own entry point.

type Result = { ok: boolean; error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function revalidate(employeeId?: string) {
  revalidatePath('/admin/meetings');
  revalidatePath('/admin/people');
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

/**
 * Book a meeting.
 *
 * For a quarterly review the quarter comes from TODAY, not from the date picked.
 * You are booking "this quarter's review"; scheduling it for the first week of
 * the next quarter — which happens constantly — still closes out the one you are
 * in, and the unique index then stops a second one being booked for the same
 * quarter.
 */
export async function scheduleMeeting(input: {
  employeeId: string;
  type: 'quarterly_review' | 'feedback_positive' | 'feedback_negative' | 'catch_up';
  scheduledFor: string;
  scheduledTime?: string;
  notes?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!DATE_RE.test(input.scheduledFor)) return { ok: false, error: 'Pick a date' };
  // An empty time input posts "", which is not a TIME. A missing time is not
  // worth failing a booking over.
  const time = TIME_RE.test(input.scheduledTime ?? '') ? input.scheduledTime : null;

  const quarter =
    input.type === 'quarterly_review' ? (await currentQuarter()).quarter : null;

  try {
    await query(
      `INSERT INTO crew_meetings
         (employee_id, type, quarter, scheduled_for, scheduled_time, notes,
          created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.employeeId,
        input.type,
        quarter,
        input.scheduledFor,
        time,
        input.notes?.trim() || null,
        guard.employee.id,
        guard.employee.name,
      ]
    );
  } catch (err) {
    // 23505 = the one-review-per-quarter index. Anything else is a real fault.
    if ((err as { code?: string }).code === '23505') {
      return { ok: false, error: 'They already have a review for this quarter' };
    }
    throw err;
  }

  revalidate(input.employeeId);
  return { ok: true };
}

/**
 * Record what was said, and close the meeting out.
 *
 * Notes are required. The database enforces it too — the record, not the calendar
 * entry, is the thing that makes a recurring problem visible months later.
 */
export async function completeMeeting(input: { id: string; notes: string }): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const notes = input.notes.trim();
  if (!notes) return { ok: false, error: 'Write down what was said first' };

  const row = await queryOne<{ employee_id: string }>(
    `UPDATE crew_meetings
        SET completed_at = NOW(), notes = $2,
            completed_by = $3, completed_by_name = $4, updated_at = NOW()
      WHERE id = $1 AND completed_at IS NULL
      RETURNING employee_id`,
    [input.id, notes, guard.employee.id, guard.employee.name]
  );
  if (!row) return { ok: false, error: 'That meeting is already closed out' };

  revalidate(row.employee_id);
  return { ok: true };
}

/** Move a meeting that has not happened yet. */
export async function rescheduleMeeting(input: {
  id: string;
  scheduledFor: string;
  scheduledTime?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!DATE_RE.test(input.scheduledFor)) return { ok: false, error: 'Pick a date' };
  const time = TIME_RE.test(input.scheduledTime ?? '') ? input.scheduledTime : null;

  const row = await queryOne<{ employee_id: string }>(
    `UPDATE crew_meetings
        SET scheduled_for = $2, scheduled_time = $3, updated_at = NOW()
      WHERE id = $1 AND completed_at IS NULL
      RETURNING employee_id`,
    [input.id, input.scheduledFor, time]
  );
  if (!row) return { ok: false, error: 'A meeting that has happened cannot be moved' };

  revalidate(row.employee_id);
  return { ok: true };
}

/**
 * Drop a meeting that never happened.
 *
 * Only while it is still scheduled: a completed meeting is the record, and the
 * point of the record is that it cannot be tidied away later.
 */
export async function deleteMeeting(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const row = await queryOne<{ employee_id: string }>(
    'DELETE FROM crew_meetings WHERE id = $1 AND completed_at IS NULL RETURNING employee_id',
    [id]
  );
  if (!row) return { ok: false, error: 'A meeting that has happened cannot be deleted' };

  revalidate(row.employee_id);
  return { ok: true };
}
