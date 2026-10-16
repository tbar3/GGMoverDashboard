import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import {
  getPmSchedules,
  getUnlinkedTrucks,
  getUnmatchedCalendarTrucks,
  getVehicles,
} from '@/lib/compliance/queries';
import { getFleetChecklist } from '@/lib/compliance/checklist-queries';
import { getWarehouses } from '@/lib/rentals';
import FleetClient from './fleet-client';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const [vehicles, unlinkedTrucks, pm, checklist, warehouses, unmatched] = await Promise.all([
    getVehicles(),
    getUnlinkedTrucks(),
    getPmSchedules(),
    getFleetChecklist(),
    getWarehouses(),
    getUnmatchedCalendarTrucks(),
  ]);

  return (
    <FleetClient
      vehicles={vehicles}
      unlinkedTrucks={unlinkedTrucks}
      pmSchedules={pm}
      checklist={checklist}
      warehouses={warehouses}
      unmatchedCalendarNames={unmatched}
      storageReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
    />
  );
}
