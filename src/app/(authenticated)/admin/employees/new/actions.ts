'use server';

import { currentUser } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { UserRole, Employee } from '@/types';

interface CreateEmployeeInput {
  name: string;
  email: string;
  role: UserRole;
  startDate: string;
  hourlyRate?: number | null;
}

export async function createEmployee(input: CreateEmployeeInput) {
  const user = await currentUser();
  if (!user) return { error: 'Not authenticated' };

  const email = user.emailAddresses[0]?.emailAddress;
  const currentEmployee = await queryOne<Pick<Employee, 'is_admin' | 'role'>>(
    'SELECT is_admin, role FROM employees WHERE email = $1',
    [email]
  );

  const isCallerAdmin = currentEmployee?.is_admin ||
    currentEmployee?.role === 'owner' ||
    currentEmployee?.role === 'manager';

  if (!isCallerAdmin) {
    return { error: 'Only admins can create employees' };
  }

  try {
    // New records from the Employees tab are crew — admin access is granted only
    // in Admin Settings, never here, so is_admin is always false on create.
    await query(
      `INSERT INTO employees (email, name, role, start_date, is_active, is_admin, hourly_rate)
       VALUES ($1, $2, $3, $4, true, false, $5)`,
      [input.email, input.name, input.role, input.startDate, input.hourlyRate ?? null]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create employee';
    return { error: message };
  }

  return { success: true };
}

interface UpdateEmployeeInput {
  id: string;
  name: string;
  role: UserRole;
  startDate: string;
  isActive: boolean;
  hourlyRate: number | null;
  phone?: string | null;
}

/**
 * Back office edits an employee — including the pay rate. Crew cannot set their
 * own rate; this is the only place it's editable. Guarded by requireBackOffice.
 */
export async function updateEmployee(input: UpdateEmployeeInput) {
  const guard = await requireBackOffice();
  if (!guard.ok) return { error: 'Back office access required' };

  try {
    // Note: is_admin and back-office roles are managed only in Admin Settings, so
    // this update deliberately leaves is_admin untouched.
    await query(
      `UPDATE employees
          SET name = $2, role = $3, start_date = $4,
              is_active = $5, hourly_rate = $6, phone = $7
        WHERE id = $1`,
      [
        input.id,
        input.name,
        input.role,
        input.startDate,
        input.isActive,
        input.hourlyRate,
        input.phone ?? null,
      ]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update employee';
    return { error: message };
  }

  revalidatePath('/admin/employees');
  return { success: true };
}

interface TerminateInput {
  id: string;
  lastDayWorked: string;
  terminationType: string; // voluntary | involuntary | layoff | other
  reason: string;
  details?: string | null;
  rehireEligible: boolean;
}

/** Record a separation: deactivate the employee and store the details for the letter. */
export async function terminateEmployee(input: TerminateInput) {
  const guard = await requireBackOffice();
  if (!guard.ok) return { error: 'Back office access required' };
  if (!input.lastDayWorked) return { error: 'Enter the last day worked' };
  if (!input.reason?.trim()) return { error: 'A reason is required' };

  try {
    await query(
      `UPDATE employees
          SET is_active = false, terminated_at = NOW(), last_day_worked = $2,
              termination_type = $3, termination_reason = $4, termination_details = $5,
              rehire_eligible = $6, terminated_by = $7
        WHERE id = $1`,
      [
        input.id,
        input.lastDayWorked,
        input.terminationType,
        input.reason.trim(),
        input.details?.trim() || null,
        input.rehireEligible,
        guard.employee.id,
      ]
    );
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to terminate' };
  }

  revalidatePath('/admin/employees');
  revalidatePath(`/admin/employees/${input.id}`);
  return { success: true };
}

/** Undo a separation — reactivate and clear the termination record. */
export async function reactivateEmployee(id: string) {
  const guard = await requireBackOffice();
  if (!guard.ok) return { error: 'Back office access required' };
  try {
    await query(
      `UPDATE employees
          SET is_active = true, terminated_at = NULL, last_day_worked = NULL,
              termination_type = NULL, termination_reason = NULL, termination_details = NULL,
              rehire_eligible = NULL, terminated_by = NULL
        WHERE id = $1`,
      [id]
    );
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to reactivate' };
  }
  revalidatePath('/admin/employees');
  revalidatePath(`/admin/employees/${id}`);
  return { success: true };
}
