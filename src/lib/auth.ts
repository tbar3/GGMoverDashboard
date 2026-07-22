import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { Employee } from '@/types';

/**
 * Central authorization helpers.
 *
 * The rule for this app:
 *   - "Back office"  = owner / manager, or anyone with is_admin. Sees company-wide data.
 *   - "Crew"         = driver / lead / helper. Sees ONLY their own data.
 *
 * Authentication (are you logged in?) is not enough — every back-office API and page
 * must also check authorization (are you allowed?). Use these helpers to do that in
 * one consistent place.
 */

export function isBackOffice(
  emp: Pick<Employee, 'role' | 'is_admin'> | null | undefined
): boolean {
  if (!emp) return false;
  return emp.is_admin === true || emp.role === 'owner' || emp.role === 'manager';
}

/** The Employee row for the signed-in Clerk user, or null if not signed in / no match. */
export async function getCurrentEmployee(): Promise<Employee | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return null;
  return queryOne<Employee>('SELECT * FROM employees WHERE email = $1', [email]);
}

type GuardOk = { ok: true; employee: Employee };
type GuardErr = { ok: false; response: NextResponse };
export type Guard = GuardOk | GuardErr;

/**
 * API guard: caller must be a known, active employee.
 * Usage:
 *   const guard = await requireEmployee();
 *   if (!guard.ok) return guard.response;
 *   const emp = guard.employee;
 */
export async function requireEmployee(): Promise<Guard> {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (!employee.is_active) {
    return { ok: false, response: NextResponse.json({ error: 'Account inactive' }, { status: 403 }) };
  }
  return { ok: true, employee };
}

/** API guard: caller must be back office (owner / manager / admin). */
export async function requireBackOffice(): Promise<Guard> {
  const guard = await requireEmployee();
  if (!guard.ok) return guard;
  if (!isBackOffice(guard.employee)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return guard;
}

/**
 * The employee_id a caller is allowed to query on a dual-use endpoint.
 * Back office: the id they asked for (null = no filter / everyone).
 * Crew: ALWAYS their own id, regardless of what they passed.
 */
export function scopedEmployeeId(employee: Employee, requestedId: string | null): string | null {
  return isBackOffice(employee) ? requestedId : employee.id;
}
