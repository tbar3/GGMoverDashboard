import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import {
  getJob,
  getJobCounts,
  getJobsForTruckDate,
  getRoutineItems,
  getJobEquipment,
  getCrewMembers,
  getTrucks,
} from '@/lib/materials/queries';
import CountSheet from '@/components/materials/CountSheet';
import JobTruckEditor from '@/components/materials/JobTruckEditor';

export const dynamic = 'force-dynamic';

export default async function MaterialsCrewJobSheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) notFound();

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

  const job = await getJob(jobId);
  if (!job) notFound();

  // Crew 24h window: completed sheets older than 24h drop off the crew view
  // (they live forever in the admin History). Open sheets are always reachable.
  if (job.status === 'complete' && (job.age_hours ?? 0) > 24) notFound();

  const [counts, dayJobs, routines, equipment, crew, trucks] = await Promise.all([
    getJobCounts(jobId),
    getJobsForTruckDate(job.truck_id, job.job_date),
    getRoutineItems(),
    getJobEquipment(jobId),
    getCrewMembers(),
    getTrucks(true),
  ]);

  const morningItems = routines
    .filter((r) => r.phase === 'morning')
    .map((r) => ({ id: r.id, label: r.label }));
  const closeItems = routines
    .filter((r) => r.phase === 'close')
    .map((r) => ({ id: r.id, label: r.label }));

  const minSeq = Math.min(...dayJobs.map((j) => j.sequence_no));
  const isFirstOfDay = job.sequence_no === minSeq;

  return (
    <div className="p-6">
      <Link
        href="/materials"
        className="mb-3 inline-block font-ui text-sm text-navy-500 hover:text-navy-700"
      >
        ← All trucks
      </Link>

      {dayJobs.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 font-ui text-sm">
          <span className="text-navy-500">
            {job.truck_name} · {job.job_date}:
          </span>
          {dayJobs.map((j) => (
            <Link
              key={j.id}
              href={`/materials/jobs/${j.id}`}
              className={`rounded-full px-3 py-1 font-semibold ${
                j.id === jobId
                  ? 'bg-navy-700 text-cream-100'
                  : 'bg-cream-50 text-navy-600 ring-1 ring-navy-100 hover:bg-cream-200'
              }`}
            >
              Job #{j.sequence_no}
              {j.status === 'complete' ? ' ✓' : ''}
            </Link>
          ))}
        </div>
      )}

      {job.status !== 'complete' && (
        <div className="mb-4">
          <JobTruckEditor
            jobId={job.id}
            currentTruckId={job.truck_id}
            trucks={trucks
              .filter((t) => t.active || t.id === job.truck_id)
              .map((t) => ({ id: t.id, name: t.name }))}
            isComplete={false}
          />
        </div>
      )}

      <CountSheet
        area="crew"
        jobId={job.id}
        truckId={job.truck_id}
        truckName={job.truck_name}
        jobDate={job.job_date}
        sequenceNo={job.sequence_no}
        status={job.status}
        isAdmin={isBackOffice(employee)}
        isFirstOfDay={isFirstOfDay}
        morningItems={morningItems}
        closeItems={closeItems}
        crew={crew.map((c) => c.name)}
        initialHeader={{
          customer: job.customer,
          job_number: job.job_number,
          crew_lead: job.crew_lead,
          crew: job.crew,
          entered_in_smartmoving: job.entered_in_smartmoving,
          is_storage_in: job.is_storage_in,
          storage_pads_used: job.storage_pads_used,
          morning_routine: job.morning_routine ?? {},
          close_routine: job.close_routine ?? {},
        }}
        initialCounts={counts.map((c) => ({
          material_id: c.material_id,
          name: c.name,
          par: c.par,
          pre_dispatch: c.pre_dispatch,
          post_dispatch: c.post_dispatch,
          post_job: c.post_job,
        }))}
        initialEquipment={equipment.map((e) => ({
          equipment_id: e.equipment_id,
          name: e.name,
          par: e.par,
          is_storage_pad: e.is_storage_pad,
          dispatch_count: e.dispatch_count,
          after_count: e.after_count,
        }))}
      />
    </div>
  );
}
