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
  isAdmin: boolean;
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
    await query(
      `INSERT INTO employees (email, name, role, start_date, is_active, is_admin, hourly_rate)
       VALUES ($1, $2, $3, $4, true, $5, $6)`,
      [
        input.email,
        input.name,
        input.role,
        input.startDate,
        input.isAdmin || input.role === 'owner' || input.role === 'manager',
        input.hourlyRate ?? null,
      ]
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
  isAdmin: boolean;
  isActive: boolean;
  hourlyRate: number | null;
}

/**
 * Back office edits an employee — including the pay rate. Crew cannot set their
 * own rate; this is the only place it's editable. Guarded by requireBackOffice.
 */
export async function updateEmployee(input: UpdateEmployeeInput) {
  const guard = await requireBackOffice();
  if (!guard.ok) return { error: 'Back office access required' };

  try {
    await query(
      `UPDATE employees
          SET name = $2, role = $3, start_date = $4, is_admin = $5,
              is_active = $6, hourly_rate = $7
        WHERE id = $1`,
      [
        input.id,
        input.name,
        input.role,
        input.startDate,
        input.isAdmin || input.role === 'owner' || input.role === 'manager',
        input.isActive,
        input.hourlyRate,
      ]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update employee';
    return { error: message };
  }

  revalidatePath('/admin/employees');
  return { success: true };
}
