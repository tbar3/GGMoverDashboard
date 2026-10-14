import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getPmSchedules, getUnlinkedTrucks, getVehicles } from '@/lib/compliance/queries';
import { getFleetChecklist } from '@/lib/compliance/checklist-queries';
import FleetClient from './fleet-client';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const [vehicles, unlinkedTrucks, pm, checklist] = await Promise.all([
    getVehicles(),
    getUnlinkedTrucks(),
    getPmSchedules(),
    getFleetChecklist(),
  ]);

  return (
    <FleetClient
      vehicles={vehicles}
      unlinkedTrucks={unlinkedTrucks}
      pmSchedules={pm}
      checklist={checklist}
      storageReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
    />
  );
}
