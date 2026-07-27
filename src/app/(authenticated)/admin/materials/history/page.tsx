import Link from 'next/link';
import { getHistory, getAdjustments } from '@/lib/materials/live-inventory';
import JobDeleteButton from './job-delete-button';

export const dynamic = 'force-dynamic';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === 'adjustments' ? 'adjustments' : 'jobs';

  const pill = (active: boolean) =>
    `rounded-lg px-4 py-2 font-ui text-sm font-semibold transition-colors ${
      active
        ? 'bg-navy-700 text-cream-100'
        : 'bg-cream-50 text-navy-600 ring-1 ring-navy-100 hover:bg-cream-200'
    }`;

  return (
    <div>
      <p className="gg-eyebrow mb-1">History</p>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-navy-700">History</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/admin/materials/history?view=jobs" className={pill(view === 'jobs')}>
          Jobs
        </Link>
        <Link
          href="/admin/materials/history?view=adjustments"
          className={pill(view === 'adjustments')}
        >
          Adjustments
        </Link>
      </div>

      {view === 'adjustments' ? <AdjustmentsSection /> : <JobsSection />}
    </div>
  );
}

async function JobsSection() {
  const jobs = await getHistory(100);
  if (jobs.length === 0) {
    return <p className="gg-surface p-4 font-ui text-sm text-navy-500">No jobs recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
      <table className="w-full text-sm">
        <thead className="gg-thead text-left">
          <tr>
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Truck</th>
            <th className="px-3 py-2.5 text-center">Job #</th>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5 text-center">Status</th>
            <th className="px-3 py-2.5 text-right">Total Used</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-300 font-ui">
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-3 py-2.5 text-navy-700">{j.job_date}</td>
              <td className="px-3 py-2.5 text-navy-700">{j.truck_name}</td>
              <td className="px-3 py-2.5 text-center text-navy-600">{j.sequence_no}</td>
              <td className="px-3 py-2.5 text-navy-700">{j.customer ?? '—'}</td>
              <td className="px-3 py-2.5 text-center">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    j.status === 'complete'
                      ? 'bg-success/15 text-success'
                      : j.status === 'dispatched'
                      ? 'bg-reassure-300/40 text-navy-700'
                      : 'bg-warning/15 text-warning'
                  }`}
                >
                  {j.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-navy-700">{j.total_used}</td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex items-center justify-end gap-3">
                  <Link
                    href={`/materials/jobs/${j.id}`}
                    className="font-semibold text-navy-600 hover:underline"
                  >
                    View / Edit
                  </Link>
                  <JobDeleteButton
                    jobId={j.id}
                    label={`${j.truck_name} Job #${j.sequence_no} (${j.job_date})`}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AdjustmentsSection() {
  const rows = await getAdjustments();

  return (
    <div>
      <p className="mb-4 font-ui text-sm text-navy-500">
        Every manual stock correction made on the Adjust screen — what changed, the reason, and who
        made it. (Receiving stock has its own log.)
      </p>
      {rows.length === 0 ? (
        <p className="gg-surface p-4 font-ui text-sm text-navy-500">No adjustments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
          <table className="w-full text-sm">
            <thead className="gg-thead text-left">
              <tr>
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5 text-right">Change</th>
                <th className="px-3 py-2.5">Reason</th>
                <th className="px-3 py-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300 font-ui">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2.5 text-navy-600">{r.at}</td>
                  <td className="px-3 py-2.5 font-semibold text-navy-700">{r.material_name}</td>
                  <td className="px-3 py-2.5 text-navy-600">{r.location}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-bold ${
                      r.qty_delta < 0 ? 'text-red-500' : 'text-success'
                    }`}
                  >
                    {r.qty_delta > 0 ? '+' : ''}
                    {r.qty_delta}
                  </td>
                  <td className="px-3 py-2.5 text-navy-700">{r.note ?? '—'}</td>
                  <td className="px-3 py-2.5 text-navy-500">{r.created_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
