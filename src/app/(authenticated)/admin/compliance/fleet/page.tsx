import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getPmSchedules, getUnlinkedTrucks, getVehicles } from '@/lib/compliance/queries';
import FleetClient from './fleet-client';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const [vehicles, unlinkedTrucks, pm] = await Promise.all([
    getVehicles(),
    getUnlinkedTrucks(),
    getPmSchedules(),
  ]);

  return <FleetClient vehicles={vehicles} unlinkedTrucks={unlinkedTrucks} pmSchedules={pm} />;
}
