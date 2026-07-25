'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { Employee } from '@/types';
import { BACK_OFFICE_ROLES } from '@/lib/roles';

type Result = { ok: boolean; error?: string };

const BACK_OFFICE_SET = new Set<string>(BACK_OFFICE_ROLES);

/** Only an owner or an admin may manage the admin team / settings. */
function canManageAdmins(emp: Pick<Employee, 'role' | 'is_admin'>): boolean {
  return emp.is_admin === true || emp.role === 'owner' || emp.role === 'admin';
}

async function requireAdminManager(): Promise<
  { ok: true; employee: Employee } | { ok: false; error: string }
> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!canManageAdmins(guard.employee)) {
    return { ok: false, error: 'Only an owner or admin can manage admin access' };
  }
  return { ok: true, employee: guard.employee };
}

/** Grant / change a back-office role. Sets is_admin so access is unambiguous. */
export async function setAdminRole(employeeId: string, role: string): Promise<Result> {
  const guard = await requireAdminManager();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!BACK_OFFICE_SET.has(role)) return { ok: false, error: 'Pick a back-office role' };
  if (!employeeId) return { ok: false, error: 'Pick a person' };

  await query('UPDATE employees SET role = $2, is_admin = TRUE WHERE id = $1', [employeeId, role]);
  revalidatePath('/admin/settings');
  revalidatePath('/admin/employees');
  return { ok: true };
}

/** Remove someone from the admin team — demote to crew (helper) and drop is_admin. */
export async function removeFromAdminTeam(employeeId: string): Promise<Result> {
  const guard = await requireAdminManager();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (employeeId === guard.employee.id) {
    return { ok: false, error: "You can't remove your own admin access" };
  }

  await query("UPDATE employees SET role = 'helper', is_admin = FALSE WHERE id = $1", [employeeId]);
  revalidatePath('/admin/settings');
  revalidatePath('/admin/employees');
  return { ok: true };
}

// ── Locations ─────────────────────────────────────────────────

export async function addLocation(name: string, address: string): Promise<Result> {
  const guard = await requireAdminManager();
  if (!guard.ok) return { ok: false, error: guard.error };
  const n = name.trim();
  if (!n) return { ok: false, error: 'A location needs a name' };
  await query(
    'INSERT INTO locations (name, address, created_by) VALUES ($1, $2, $3)',
    [n, address.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/settings');
  return { ok: true };
}

export async function toggleLocation(id: string, active: boolean): Promise<Result> {
  const guard = await requireAdminManager();
  if (!guard.ok) return { ok: false, error: guard.error };
  await query('UPDATE locations SET is_active = $2 WHERE id = $1', [id, active]);
  revalidatePath('/admin/settings');
  return { ok: true };
}

export async function deleteLocation(id: string): Promise<Result> {
  const guard = await requireAdminManager();
  if (!guard.ok) return { ok: false, error: guard.error };
  await query('DELETE FROM locations WHERE id = $1', [id]);
  revalidatePath('/admin/settings');
  return { ok: true };
}
