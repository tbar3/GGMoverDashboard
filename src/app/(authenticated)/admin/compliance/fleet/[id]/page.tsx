import { notFound, redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import {
  getAttachments,
  getEmployeeOptions,
  getItems,
  getOdometerReadings,
  getPmSchedules,
  getServiceLog,
  getVehicle,
} from '@/lib/compliance/queries';
import VehicleDetail from './vehicle-detail';

export const dynamic = 'force-dynamic';

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const [items, schedules, log, readings, attachments, employees] = await Promise.all([
    getItems({ vehicleId: id, status: 'all' }),
    getPmSchedules(id),
    getServiceLog(id),
    getOdometerReadings(id),
    getAttachments({ vehicleId: id }),
    getEmployeeOptions(),
  ]);

  return (
    <VehicleDetail
      vehicle={vehicle}
      items={items}
      schedules={schedules}
      log={log}
      readings={readings}
      attachments={attachments}
      employees={employees}
      storageReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
    />
  );
}
