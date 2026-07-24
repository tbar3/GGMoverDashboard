'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
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
