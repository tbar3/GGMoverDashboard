import Link from 'next/link';
import { getCurrentEmployee } from '@/lib/auth';
import { getTrucks, getCrewRecentJobs, getCrewEmployeeNames } from '@/lib/materials/queries';
import { createJob } from '@/lib/materials/actions';
import { CrewStartForm } from './crew-start-form';

export const dynamic = 'force-dynamic';

export default async function MaterialsCrewHome() {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return (
      <div className="p-6">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-muted-foreground">
            Employee profile not found. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const [trucks, recent, crewNames] = await Promise.all([
    getTrucks(),
    getCrewRecentJobs(),
    getCrewEmployeeNames(),
  ]);

  async function start(formData: FormData) {
    'use server';
    const truckId = Number(formData.get('truckId'));
    const date = String(formData.get('date'));
    const storageIn = formData.get('storageIn') === 'on';
    await createJob(truckId, date, storageIn, 'crew', {
      customer: String(formData.get('customer') ?? ''),
      jobNumber: String(formData.get('jobNumber') ?? ''),
      crewLead: String(formData.get('crewLead') ?? ''),
      crew: formData.getAll('crew').map(String).join(', '),
    });
  }

  return (
    <div className="p-6">
      <p className="gg-eyebrow mb-1">Materials</p>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-navy-700">
        Start a Truck Count
      </h1>
      <p className="mb-5 font-ui text-sm text-navy-500">
        Pick your truck to open its count sheet. If a sheet is already open for that truck,
        you&apos;ll jump back into it.
      </p>

      {trucks.length === 0 ? (
        <p className="rounded-lg border-2 border-warning bg-warning/10 p-4 font-ui text-sm text-navy-700">
          No trucks set up yet — ask Trent.
        </p>
      ) : (
        <CrewStartForm trucks={trucks} crewNames={crewNames} action={start} />
      )}

      <div className="mt-8">
        <p className="gg-eyebrow mb-1">Last 24 Hours</p>
        <h2 className="mb-3 font-display text-lg font-bold tracking-tight text-navy-700">
          Recent Sheets
        </h2>
        {recent.length === 0 ? (
          <p className="font-ui text-sm text-navy-400">No count sheets in the last 24 hours.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((j) => (
              <Link
                key={j.id}
                href={`/materials/jobs/${j.id}`}
                className="flex items-center justify-between rounded-xl border-2 border-navy-100 bg-cream-50 px-4 py-3 hover:bg-cream-200"
              >
                <span className="font-ui text-sm text-navy-700">
                  <span className="font-bold">{j.truck_name}</span> · Job #{j.sequence_no}
                  {j.customer ? ` · ${j.customer}` : ''}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-ui text-xs font-semibold ${
                    j.status === 'complete'
                      ? 'bg-success/15 text-success'
                      : j.status === 'dispatched'
                        ? 'bg-reassure-300/40 text-navy-700'
                        : 'bg-warning/15 text-warning'
                  }`}
                >
                  {j.status === 'complete'
                    ? 'Done'
                    : j.status === 'dispatched'
                      ? 'In progress'
                      : 'New'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
