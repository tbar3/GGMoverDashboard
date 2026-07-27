'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveLeakage } from '@/lib/materials/actions';
import type { LeakageJob } from '@/lib/materials/live-inventory';

const money = (n: number) => `$${n.toFixed(2)}`;

export function LeakageEditor({ jobs }: { jobs: LeakageJob[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedJob, setSavedJob] = useState<number | null>(null);

  const initial: Record<string, string> = {};
  for (const j of jobs)
    for (const m of j.materials)
      initial[`${j.job_id}:${m.material_id}`] =
        m.charged === null || m.charged === undefined ? '' : String(m.charged);
  const [vals, setVals] = useState(initial);

  const key = (j: number, m: number) => `${j}:${m}`;
  const chargedNum = (j: number, m: number): number | null => {
    const v = vals[key(j, m)];
    if (v === undefined || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  const summary = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      for (const m of j.materials) {
        const charged = chargedNum(j.job_id, m.material_id);
        if (charged === null) continue;
        const leak = ((m.used ?? 0) - charged) * m.charge_per_unit;
        const lead = j.crew_lead || '—';
        map.set(lead, (map.get(lead) ?? 0) + leak);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, jobs]);

  const saveJob = (j: LeakageJob) => {
    setSavedJob(null);
    startTransition(async () => {
      await saveLeakage(
        j.job_id,
        j.materials.map((m) => ({
          material_id: m.material_id,
          charged: chargedNum(j.job_id, m.material_id),
        }))
      );
      setSavedJob(j.job_id);
      router.refresh();
    });
  };

  if (jobs.length === 0) {
    return (
      <p className="gg-surface p-4 font-ui text-sm text-navy-500">
        No completed jobs with usage yet.
      </p>
    );
  }

  return (
    <div>
      {/* Summary by crew lead */}
      <div className="gg-card mb-5 p-4">
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">
          Leakage $ by Crew Lead
        </h3>
        <div className="font-ui text-sm">
          {summary.length === 0 ? (
            <p className="text-navy-300">Enter charged amounts below to see leakage.</p>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-cream-300">
                {summary.map(([lead, amt]) => (
                  <tr key={lead}>
                    <td className="py-1.5 font-semibold text-navy-700">{lead}</td>
                    <td
                      className={`py-1.5 text-right font-bold ${
                        amt > 0 ? 'text-red-500' : 'text-success'
                      }`}
                    >
                      {money(amt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Per-job editors */}
      <div className="space-y-4">
        {jobs.map((j) => (
          <div key={j.job_id} className="gg-surface p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-display font-bold text-navy-700">
                  {j.truck_name} · Job #{j.sequence_no}
                </span>
                <span className="ml-2 font-ui text-sm text-navy-500">
                  {j.job_date}
                  {j.customer ? ` · ${j.customer}` : ''}
                </span>
              </div>
              <span className="font-ui text-sm text-navy-600">
                Crew Lead: <strong>{j.crew_lead || '—'}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="font-ui text-xs uppercase tracking-wide text-navy-400">
                  <tr>
                    <th className="py-1 text-left">Material</th>
                    <th className="py-1 text-right">Used</th>
                    <th className="py-1 text-center">Charged</th>
                    <th className="py-1 text-right">Leak Qty</th>
                    <th className="py-1 text-right">Leak $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-300 font-ui">
                  {j.materials.map((m) => {
                    const charged = chargedNum(j.job_id, m.material_id);
                    const leakQty = charged === null ? null : (m.used ?? 0) - charged;
                    const leak$ = leakQty === null ? null : leakQty * m.charge_per_unit;
                    return (
                      <tr key={m.material_id}>
                        <td className="py-1.5 font-semibold text-navy-700">{m.name}</td>
                        <td className="py-1.5 text-right text-navy-600">{m.used ?? 0}</td>
                        <td className="py-1.5 text-center">
                          <input
                            inputMode="numeric"
                            className="gg-input-num"
                            value={vals[key(j.job_id, m.material_id)] ?? ''}
                            onChange={(e) =>
                              setVals((p) => ({
                                ...p,
                                [key(j.job_id, m.material_id)]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td
                          className={`py-1.5 text-right font-semibold ${
                            leakQty && leakQty > 0 ? 'text-red-500' : 'text-navy-400'
                          }`}
                        >
                          {leakQty ?? '—'}
                        </td>
                        <td
                          className={`py-1.5 text-right font-bold ${
                            leak$ && leak$ > 0 ? 'text-red-500' : 'text-navy-400'
                          }`}
                        >
                          {leak$ === null ? '—' : money(leak$)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={() => saveJob(j)} disabled={pending} className="gg-btn-sm mt-3">
              {savedJob === j.job_id ? 'Saved ✓' : 'Save charged amounts'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
