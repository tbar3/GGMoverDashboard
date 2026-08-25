'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

// Morning Meeting writes — back office only. Every action self-guards; the /admin
// layout guard protects the page, but a server action is its own entry point and
// cannot rely on it.

type Result = { ok: boolean; error?: string };
/** Dismissals return what they touched so the UI can offer a real Undo. */
type DismissResult = Result & { ids?: string[] };

const PATH = '/admin/morning-meeting';

function revalidate() {
  revalidatePath(PATH);
}

// ── Recognition ──────────────────────────────────────────────────────────────

/**
 * Dismiss recognition. Called with one positive's id, or with an employee id to
 * clear everyone of that person's outstanding wins in one click.
 *
 * Nothing is deleted — dismissal only records that a positive has been read out.
 * The bonus_positives row, and therefore the crew member's pay, is untouched.
 */
export async function dismissRecognition(input: {
  positiveIds?: string[];
  employeeId?: string;
}): Promise<DismissResult> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  let ids = input.positiveIds ?? [];
  if (input.employeeId) {
    const rows = await query<{ id: string }>(
      `SELECT p.id FROM bonus_positives p
         LEFT JOIN morning_meeting_recognitions r ON r.positive_id = p.id
        WHERE p.employee_id = $1 AND r.positive_id IS NULL`,
      [input.employeeId]
    );
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) return { ok: false, error: 'Nothing to dismiss' };

  await query(
    `INSERT INTO morning_meeting_recognitions (positive_id, dismissed_by)
     SELECT id, $2 FROM UNNEST($1::uuid[]) AS t(id)
     ON CONFLICT (positive_id) DO NOTHING`,
    [ids, guard.employee.id]
  );
  revalidate();
  return { ok: true, ids };
}

/** Undo — puts dismissed positives back on the board. */
export async function restoreRecognition(positiveIds: string[]): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (positiveIds.length === 0) return { ok: false, error: 'Nothing to restore' };

  await query('DELETE FROM morning_meeting_recognitions WHERE positive_id = ANY($1::uuid[])', [
    positiveIds,
  ]);
  revalidate();
  return { ok: true };
}

// ── Ad-hoc reminders logged in the meeting ───────────────────────────────────

export async function addNote(input: { body: string; policyId?: string }): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Write the reminder first' };

  await query(
    `INSERT INTO morning_meeting_notes (body, policy_id, author_id, author_name)
     VALUES ($1, $2, $3, $4)`,
    [body, input.policyId || null, guard.employee.id, guard.employee.name]
  );
  revalidate();
  return { ok: true };
}

export async function deleteNote(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM morning_meeting_notes WHERE id = $1', [id]);
  revalidate();
  return { ok: true };
}

/**
 * Save a one-off reminder into the policy list — the path by which "we keep saying
 * this every morning" becomes real policy.
 *
 * It lands as a DRAFT, not a published policy. Published policies are visible to
 * the whole crew at /policies, and a sentence typed in a hurry at 7:20 is not
 * something to publish to everyone unreviewed. It shows up on the Policies page
 * ready to be worded properly and published from there.
 */
export async function promoteNote(input: { noteId: string; title: string }): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give it a title' };

  const note = await queryOne<{ body: string; policy_id: string | null }>(
    'SELECT body, policy_id FROM morning_meeting_notes WHERE id = $1',
    [input.noteId]
  );
  if (!note) return { ok: false, error: 'That note is gone' };
  if (note.policy_id) return { ok: false, error: 'Already saved to the policy list' };

  const created = await queryOne<{ id: string }>(
    `INSERT INTO policies (title, body_en, category, status, created_by)
     VALUES ($1, $2, 'general', 'draft', $3) RETURNING id`,
    [title, note.body, guard.employee.id]
  );
  await query('UPDATE morning_meeting_notes SET policy_id = $2, updated_at = NOW() WHERE id = $1', [
    input.noteId,
    created!.id,
  ]);
  revalidate();
  revalidatePath('/admin/policies');
  return { ok: true };
}

// ── Policy of the Day ────────────────────────────────────────────────────────

/** Override today's auto-rotated pick with a specific reminder. */
export async function pinPolicyOfDay(input: {
  policyId: string;
  today: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today)) return { ok: false, error: 'Bad date' };

  await query(
    `INSERT INTO morning_meeting_days (meeting_date, policy_id, pinned, pinned_by)
     VALUES ($1, $2, TRUE, $3)
     ON CONFLICT (meeting_date) DO UPDATE
        SET policy_id = EXCLUDED.policy_id, pinned = TRUE,
            pinned_by = EXCLUDED.pinned_by, updated_at = NOW()`,
    [input.today, input.policyId, guard.employee.id]
  );
  revalidate();
  return { ok: true };
}

/**
 * Hand today back to the rotation. Deleting the row rather than clearing the
 * policy lets the next page load pick fresh — and keeps the day log meaning
 * exactly "this is what we covered", with no half-rows in it.
 */
export async function unpinPolicyOfDay(today: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, error: 'Bad date' };
  await query('DELETE FROM morning_meeting_days WHERE meeting_date = $1', [today]);
  revalidate();
  return { ok: true };
}
