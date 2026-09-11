import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getEmployeeOptions, getItems, getVehicleOptions } from '@/lib/compliance/queries';
import ItemsClient from './items-client';

// Expiration states are computed against today's date, so nothing here can be
// cached between requests without eventually being wrong.
export const dynamic = 'force-dynamic';

export default async function ComplianceItemsPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const [items, employees, vehicles] = await Promise.all([
    // 'all' so archived and not-applicable rows are reachable through the
    // filters rather than invisible.
    getItems({ status: 'all' }),
    getEmployeeOptions(),
    getVehicleOptions(),
  ]);

  return (
    <ItemsClient
      items={items}
      employees={employees}
      vehicles={vehicles}
      currentEmployeeId={employee!.id}
    />
  );
}
