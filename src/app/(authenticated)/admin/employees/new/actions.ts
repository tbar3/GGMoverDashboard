'use server';

import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { UserRole, Employee } from '@/types';

interface CreateEmployeeInput {
  name: string;
  email: string;
  role: UserRole;
  startDate: string;
  isAdmin: boolean;
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
      `INSERT INTO employees (email, name, role, start_date, is_active, is_admin)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [input.email, input.name, input.role, input.startDate, input.isAdmin || input.role === 'owner' || input.role === 'manager']
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create employee';
    return { error: message };
  }

  return { success: true };
}
