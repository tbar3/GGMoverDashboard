import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getDriverChecklist } from '@/lib/compliance/checklist-queries';
import DriversClient from './drivers-client';

// Medical-card states are computed against today's date.
export const dynamic = 'force-dynamic';

export default async function DriverFilesPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const rows = await getDriverChecklist();
  return <DriversClient rows={rows} storageReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} />;
}
