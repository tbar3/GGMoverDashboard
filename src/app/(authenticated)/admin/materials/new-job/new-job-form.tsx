'use client';

import { useEffect, useState } from 'react';
import type { JobCrewOption } from '@/lib/bonus';

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function NewJobForm({
  trucks,
  action,
}: {
  trucks: { id: number; name: string }[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [calJobs, setCalJobs] = useState<JobCrewOption[]>([]);
  const [selJobId, setSelJobId] = useState('');
  const [loading, setLoading] = useState(false);

  // Pull calendar jobs for the chosen date so a count sheet can auto-fill from one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/jobs/by-date?date=${date}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: JobCrewOption[]) => {
        if (!cancelled) {
          setCalJobs(Array.isArray(d) ? d : []);
          setSelJobId('');
        }
      })
      .catch(() => !cancelled && setCalJobs([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const sel = calJobs.find((j) => j.id === selJobId);
  const customer = sel?.customer ?? '';
  const jobNumber = sel?.jobNumber ?? '';
  const crewNames = sel ? sel.crew.map((c) => c.name).join(', ') : '';
  const crewLead = sel ? sel.crew.find((c) => c.role === 'lead')?.name ?? '' : '';

  return (
    <div className="mx-auto max-w-md">
      <p className="gg-eyebrow mb-1">New Job</p>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-navy-700">
        Start a Job Count
      </h1>
      <p className="mb-5 font-ui text-sm text-navy-500">
        Pick the truck and date. Link a calendar job to auto-fill the customer, job #, and crew.
      </p>

      {trucks.length === 0 ? (
        <p className="rounded-lg border-2 border-warning bg-warning/10 p-4 font-ui text-sm text-navy-700">
          No trucks yet. Add one under <strong>Admin</strong> first.
        </p>
      ) : (
        <form action={action} className="gg-card space-y-4 p-5">
          <label className="block">
            <span className="gg-eyebrow mb-1 block">Truck</span>
            <select name="truckId" required defaultValue="" className="gg-input w-full">
              <option value="" disabled>
                Choose a truck…
              </option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="gg-eyebrow mb-1 block">Date</span>
            <input
              type="date"
              name="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="gg-input box-border block h-11 w-full min-w-0 appearance-none"
            />
          </label>

          {/* Calendar job auto-fill */}
          <label className="block">
            <span className="gg-eyebrow mb-1 block">Calendar job (optional)</span>
            <select
              value={selJobId}
              onChange={(e) => setSelJobId(e.target.value)}
              className="gg-input w-full"
              disabled={loading}
            >
              <option value="">
                {loading
                  ? 'Loading…'
                  : calJobs.length === 0
                    ? 'No calendar jobs on this date'
                    : '— enter details manually —'}
              </option>
              {calJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.startTime ? `${j.startTime} · ` : ''}
                  {j.jobNumber ? `#${j.jobNumber} · ` : ''}
                  {j.customer ?? 'Job'} ({j.crew.length})
                </option>
              ))}
            </select>
          </label>

          {sel && (
            <div className="rounded-md border-2 border-navy-100 bg-cream-50 p-3 font-ui text-sm text-navy-600">
              <div>
                <span className="font-semibold text-navy-700">{customer || '—'}</span>
                {jobNumber ? ` · Job #${jobNumber}` : ''}
              </div>
              <div className="text-navy-500">
                Crew: {crewNames || '—'}
                {crewLead ? ` · Lead: ${crewLead}` : ''}
              </div>
              <p className="mt-1 text-xs text-navy-400">Auto-fills the count sheet — editable there.</p>
            </div>
          )}

          {/* Hidden fields carry the auto-filled header into the count sheet */}
          <input type="hidden" name="customer" value={customer} />
          <input type="hidden" name="jobNumber" value={jobNumber} />
          <input type="hidden" name="crew" value={crewNames} />
          <input type="hidden" name="crewLead" value={crewLead} />

          <label className="flex items-start gap-2 rounded-md border-2 border-navy-100 bg-cream-50 p-3 font-ui text-sm text-navy-700">
            <input type="checkbox" name="storageIn" className="mt-0.5 h-5 w-5" />
            <span>
              <span className="font-semibold">Storage-In job</span>
              <span className="block text-navy-500">
                Pads stay wrapped in storage. In Step 2 the crew records pads left in storage on the
                Furniture Pads row — charged to the customer and deducted from total pads on hand.
              </span>
            </span>
          </label>

          <button type="submit" className="gg-btn-cta w-full">
            Open Count Sheet
          </button>
        </form>
      )}
    </div>
  );
}
