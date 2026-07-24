'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { weekStartOf, POSITIVE_TYPES, STRIKE_TYPES } from '@/lib/bonus';

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

  await query(
    `INSERT INTO bonus_strikes (employee_id, week_start, type, event_date, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.employeeId, weekStartOf(date), input.type, date, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/performance');
  return { ok: true };
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

export async function voidStrike(strikeId: string, reason: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const r = reason.trim();
  if (!r) return { ok: false, error: 'A void needs a reason' };
  await query(
    `UPDATE bonus_strikes SET voided = TRUE, void_reason = $2 WHERE id = $1 AND voided = FALSE`,
    [strikeId, r]
  );
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
