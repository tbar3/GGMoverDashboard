import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getCurrentEmployee } from '@/lib/auth';
import { BACK_OFFICE_ROLES } from '@/lib/roles';
import { AdminTeamManager, LocationsManager } from './admin-settings-client';
import { EventsExportCard } from './events-export-card';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const me = await getCurrentEmployee();
  // Only an owner or admin manages admin access.
  if (!me || !(me.is_admin || me.role === 'owner' || me.role === 'admin')) {
    redirect('/admin');
  }

  const roles = BACK_OFFICE_ROLES as string[];
  const [team, locations] = await Promise.all([
    query<{ id: string; name: string; email: string; role: string }>(
      `SELECT id, name, email, role FROM employees
        WHERE role = ANY($1) OR is_admin = TRUE
        ORDER BY name`,
      [roles]
    ),
    query<{ id: string; name: string; address: string | null; is_active: boolean }>(
      'SELECT id, name, address, is_active FROM locations ORDER BY is_active DESC, name'
    ),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage who has back-office access and the company&apos;s locations.
        </p>
      </div>
      <EventsExportCard />
      <AdminTeamManager team={team} />
      <LocationsManager locations={locations} />
    </div>
  );
}
