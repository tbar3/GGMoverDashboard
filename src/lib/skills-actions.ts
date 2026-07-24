'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice, getCurrentEmployee } from '@/lib/auth';

// Skills / pay-scale writes.
// Back office grants/revokes skills; the employee acknowledges the celebration.

function revalidateFor(employeeId: string) {
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath('/dashboard');
  revalidatePath('/skills');
}

export async function grantSkill(
  employeeId: string,
  skillId: string
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  // New grant → acknowledged FALSE so the employee gets the celebration.
  await query(
    `INSERT INTO employee_skills (employee_id, skill_id, granted_by, acknowledged)
     VALUES ($1, $2, $3, FALSE)
     ON CONFLICT (employee_id, skill_id) DO NOTHING`,
    [employeeId, skillId, guard.employee.id]
  );
  revalidateFor(employeeId);
  return { ok: true };
}

export async function revokeSkill(
  employeeId: string,
  skillId: string
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  await query('DELETE FROM employee_skills WHERE employee_id = $1 AND skill_id = $2', [
    employeeId,
    skillId,
  ]);
  revalidateFor(employeeId);
  return { ok: true };
}

/**
 * The signed-in employee dismisses their skill-celebration — marks all their
 * unacknowledged skills as seen. Scoped to their own row.
 */
export async function acknowledgeMySkills(): Promise<{ ok: boolean }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { ok: false };
  await query(
    'UPDATE employee_skills SET acknowledged = TRUE WHERE employee_id = $1 AND acknowledged = FALSE',
    [employee.id]
  );
  revalidatePath('/dashboard');
  revalidatePath('/skills');
  return { ok: true };
}

// ── Pay-scale catalog management (back office) ────────────────

function revalidatePayScale() {
  revalidatePath('/admin/skills');
  revalidatePath('/skills');
  revalidatePath('/dashboard');
}

function parseRate(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? '').replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

export async function createSkill(
  name: string,
  raiseAmount: string
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const trimmed = name.trim();
  const raise = parseRate(raiseAmount);
  if (!trimmed) return { ok: false, error: 'Skill name is required' };
  if (raise == null || raise < 0) return { ok: false, error: 'Enter a valid raise amount' };

  const max = await queryOne<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM skills');
  try {
    await query(
      'INSERT INTO skills (name, raise_amount, sort_order) VALUES ($1, $2, $3)',
      [trimmed, raise, (max?.m ?? 0) + 1]
    );
  } catch {
    return { ok: false, error: 'A skill with that name already exists' };
  }
  revalidatePayScale();
  return { ok: true };
}

export async function updateSkill(
  id: string,
  name: string,
  raiseAmount: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const trimmed = name.trim();
  const raise = parseRate(raiseAmount);
  if (!trimmed) return { ok: false, error: 'Skill name is required' };
  if (raise == null || raise < 0) return { ok: false, error: 'Enter a valid raise amount' };

  try {
    await query('UPDATE skills SET name = $2, raise_amount = $3, active = $4 WHERE id = $1', [
      id,
      trimmed,
      raise,
      active,
    ]);
  } catch {
    return { ok: false, error: 'A skill with that name already exists' };
  }
  revalidatePayScale();
  return { ok: true };
}

// Hard delete — cascades to employee_skills (removes the skill from everyone who
// had it). Use the Active toggle instead to just hide it from the catalog.
export async function deleteSkill(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM skills WHERE id = $1', [id]);
  revalidatePayScale();
  return { ok: true };
}

export async function setBaseRate(raw: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const rate = parseRate(raw);
  if (rate == null || rate < 0) return { ok: false, error: 'Enter a valid base rate' };
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('base_hourly_rate', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [rate.toFixed(2)]
  );
  revalidatePayScale();
  return { ok: true };
}
