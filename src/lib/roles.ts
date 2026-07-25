import { UserRole } from '@/types';

/**
 * Role model. Back-office roles are managed only from Admin Settings (deliberate,
 * role-gated); crew roles are managed on the Employees tab. Keep this in sync with
 * the employees_role_check constraint in the DB.
 */
export const BACK_OFFICE_ROLES: UserRole[] = ['owner', 'admin', 'manager', 'sales'];
export const CREW_ROLES: UserRole[] = ['driver', 'lead', 'helper'];

export function isBackOfficeRole(role: string | null | undefined): boolean {
  return !!role && (BACK_OFFICE_ROLES as string[]).includes(role);
}

const LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales',
  driver: 'Driver',
  lead: 'Lead',
  helper: 'Helper',
};
export function roleLabel(role: string): string {
  return LABELS[role] ?? role;
}
