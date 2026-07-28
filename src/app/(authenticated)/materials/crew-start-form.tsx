'use client';

import { useEffect, useState } from 'react';
import type { JobCrewOption } from '@/lib/bonus';

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function CrewStartForm({
  trucks,
  crewNames,
  action,
}: {
  trucks: { id: number; name: string }[];
  crewNames: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [calJobs, setCalJobs] = useState<JobCrewOption[]>([]);
  const [selJobId, setSelJobId] = useState('');
  const [loading, setLoading] = useState(false);

  // Manual fields (also filled when a calendar job is picked).
  const [customer, setCustomer] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [crewLead, setCrewLead] = useState('');
  const [selectedCrew, setSelectedCrew] = useState<Set<string>>(new Set());

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

  const pickCalJob = (id: string) => {
    setSelJobId(id);
    const j = calJobs.find((x) => x.id === id);
    if (!j) return;
    setCustomer(j.customer ?? '');
    setJobNumber(j.jobNumber ?? '');
    setCrewLead(j.crew.find((c) => c.role === 'lead')?.name ?? '');
    setSelectedCrew(new Set(j.crew.map((c) => c.name)));
  };

  const toggleCrew = (name: string) =>
    setSelectedCrew((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  // The crew lead may be a name not in the active crew list — keep it selectable.
  const leadOptions = crewLead && !crewNames.includes(crewLead) ? [crewLead, ...crewNames] : crewNames;

  return (
    <form action={action} className="gg-card space-y-4 p-5">
      <label className="block">
        <span className="gg-eyebrow mb-1 block">Truck</span>
        <select name="truckId" required defaultValue="" className="gg-input w-full">
          <option value="" disabled>
            Choose your truck…
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

      {/* Calendar auto-fill */}
      <label className="block">
        <span className="gg-eyebrow mb-1 block">Calendar job (auto-fill)</span>
        <select
          value={selJobId}
          onChange={(e) => pickCalJob(e.target.value)}
          className="gg-input w-full"
          disabled={loading}
        >
          <option value="">
            {loading
              ? 'Loading…'
              : calJobs.length === 0
                ? 'No calendar jobs on this date'
                : '— pick your job to auto-fill —'}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="gg-eyebrow mb-1 block">Customer name</span>
          <input
            name="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="e.g. Amber Mirani"
            className="gg-input w-full"
          />
        </label>
        <label className="block">
          <span className="gg-eyebrow mb-1 block">Job #</span>
          <input
            name="jobNumber"
            value={jobNumber}
            onChange={(e) => setJobNumber(e.target.value)}
            placeholder="e.g. 1804-2"
            className="gg-input w-full"
          />
        </label>
      </div>

      <label className="block">
        <span className="gg-eyebrow mb-1 block">Crew Lead</span>
        <select
          name="crewLead"
          value={crewLead}
          onChange={(e) => setCrewLead(e.target.value)}
          className="gg-input w-full"
        >
          <option value="">Select…</option>
          {leadOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <div className="block">
        <span className="gg-eyebrow mb-1 block">Crew</span>
        {crewNames.length === 0 ? (
          <p className="font-ui text-sm text-navy-400">No crew members yet — add them under Employees.</p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border-2 border-navy-100 bg-cream-50 p-2">
            {crewNames.map((name) => (
              <label key={name} className="flex items-center gap-2 font-ui text-sm text-navy-700">
                <input
                  type="checkbox"
                  name="crew"
                  value={name}
                  checked={selectedCrew.has(name)}
                  onChange={() => toggleCrew(name)}
                  className="h-4 w-4"
                />
                {name}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 rounded-md border-2 border-navy-100 bg-cream-50 p-3 font-ui text-sm text-navy-700">
        <input type="checkbox" name="storageIn" className="mt-0.5 h-5 w-5" />
        <span>
          <span className="font-semibold">Storage-In job</span>
          <span className="block text-navy-500">
            Pads stay wrapped in storage — you&apos;ll record pads left in storage on the Furniture
            Pads row in Step 2.
          </span>
        </span>
      </label>

      <button type="submit" className="gg-btn-cta w-full">
        Open Count Sheet
      </button>
    </form>
  );
}
