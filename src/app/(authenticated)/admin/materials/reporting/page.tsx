import Link from 'next/link';
import {
  getUsage,
  getLeakageJobs,
  getDiscrepancies,
  getUsageRates,
} from '@/lib/materials/live-inventory';
import {
  emailUsageReport,
  emailLeakageReport,
  emailReconcileReport,
} from '@/lib/materials/report-actions';
import { EmailReport } from './email-report';
import { LeakageEditor } from './leakage-editor';

export const dynamic = 'force-dynamic';

const money = (n: number) => `$${n.toFixed(2)}`;
const isoDate = (d: Date) => d.toLocaleDateString('en-CA');

type View = 'usage' | 'leakage' | 'reconcile' | 'burn';
const VIEWS: { key: View; label: string }[] = [
  { key: 'usage', label: 'Usage' },
  { key: 'leakage', label: 'Leakage' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'burn', label: 'Burn Rate' },
];

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string; window?: string }>;
}) {
  const sp = await searchParams;
  const view: View =
    sp.view === 'leakage' || sp.view === 'reconcile' || sp.view === 'burn' ? sp.view : 'usage';

  return (
    <div>
      <p className="gg-eyebrow mb-1">Reporting</p>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-navy-700">Reports</h1>

      {/* Sub-switcher */}
      <div className="mb-6 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/admin/materials/reporting?view=${v.key}`}
            className={`rounded-lg px-4 py-2 font-ui text-sm font-semibold transition-colors ${
              view === v.key
                ? 'bg-navy-700 text-cream-100'
                : 'bg-cream-50 text-navy-600 ring-1 ring-navy-100 hover:bg-cream-200'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {view === 'usage' && <UsageSection from={sp.from} to={sp.to} />}
      {view === 'leakage' && <LeakageSection />}
      {view === 'reconcile' && <ReconcileSection />}
      {view === 'burn' && <BurnRateSection window={sp.window} />}
    </div>
  );
}

async function BurnRateSection({ window }: { window?: string }) {
  const windowDays = [30, 60, 90].includes(Number(window)) ? Number(window) : 30;
  const rows = await getUsageRates(windowDays);

  const today = new Date();
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US');
  const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  const computed = rows.map((m) => {
    const daily = m.used / windowDays;
    const weekly = daily * 7;
    const monthly = daily * 30.44;
    const monthlyPct = m.total > 0 ? (monthly / m.total) * 100 : null;
    let daysToReorder: number | null = null;
    if (daily > 0) daysToReorder = Math.max(0, (m.total - m.threshold) / daily);
    let reorderText = '—';
    if (daily <= 0) reorderText = 'no usage';
    else if (m.total <= m.threshold) reorderText = 'reorder now';
    else {
      const d = new Date(today);
      d.setDate(d.getDate() + Math.round(daysToReorder as number));
      reorderText = `~${Math.round(daysToReorder as number)}d (${fmtDate(d)})`;
    }
    return { ...m, daily, weekly, monthly, monthlyPct, reorderText };
  });

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-navy-700">
        Burn Rate &amp; Reorder Forecast
      </h2>
      <p className="mb-4 font-ui text-sm text-navy-500">
        How fast each material is used (based on the last {windowDays} days of usage) and roughly
        when it&apos;ll hit its Low Level. &quot;Mo. %&quot; is monthly usage as a share of what&apos;s
        on hand now.
      </p>

      <form method="get" className="gg-surface mb-5 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="view" value="burn" />
        <label className="block">
          <span className="gg-eyebrow mb-1 block">Based on last</span>
          <select name="window" defaultValue={String(windowDays)} className="gg-input">
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <button type="submit" className="gg-btn-primary">
          Update
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
        <table className="w-full text-sm">
          <thead className="gg-thead text-left">
            <tr>
              <th className="px-3 py-2.5">Material</th>
              <th className="px-2 py-2.5 text-right">/day</th>
              <th className="px-2 py-2.5 text-right">/week</th>
              <th className="px-2 py-2.5 text-right">/month</th>
              <th className="px-2 py-2.5 text-right">On hand</th>
              <th className="px-2 py-2.5 text-right">Low Level</th>
              <th className="px-2 py-2.5 text-right">Mo. %</th>
              <th className="px-3 py-2.5">Reorder in…</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300 font-ui">
            {computed.map((m) => (
              <tr key={m.material_id}>
                <td className="px-3 py-2.5 font-semibold text-navy-700">{m.name}</td>
                <td className="px-2 py-2.5 text-right text-navy-600">{r1(m.daily)}</td>
                <td className="px-2 py-2.5 text-right text-navy-600">{r1(m.weekly)}</td>
                <td className="px-2 py-2.5 text-right text-navy-600">{r1(m.monthly)}</td>
                <td className="px-2 py-2.5 text-right font-semibold text-navy-700">{m.total}</td>
                <td className="px-2 py-2.5 text-right text-navy-400">{m.threshold}</td>
                <td className="px-2 py-2.5 text-right text-navy-600">
                  {m.monthlyPct === null ? '—' : `${Math.round(m.monthlyPct)}%`}
                </td>
                <td
                  className={`px-3 py-2.5 font-semibold ${
                    m.reorderText === 'reorder now' ? 'text-red-500' : 'text-navy-700'
                  }`}
                >
                  {m.reorderText}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function UsageSection({ from: f, to: t }: { from?: string; to?: string }) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  const from = f || isoDate(monthAgo);
  const to = t || isoDate(today);

  const usage = await getUsage(from, to);
  const totals = usage.reduce(
    (a, u) => ({
      used: a.used + u.total_used,
      cost: a.cost + u.cost,
      revenue: a.revenue + u.revenue,
      profit: a.profit + u.profit,
    }),
    { used: 0, cost: 0, revenue: 0, profit: 0 }
  );

  async function emailAction(recipient: string) {
    'use server';
    return emailUsageReport(recipient, from, to);
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Usage Totals</h2>
      <p className="mb-4 font-ui text-sm text-navy-500">
        Quantity used, what it cost us, and what we made over a date range.
      </p>

      <EmailReport action={emailAction} />

      <form method="get" className="gg-surface mb-5 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="view" value="usage" />
        <label className="block">
          <span className="gg-eyebrow mb-1 block">From</span>
          <input type="date" name="from" defaultValue={from} className="gg-input" />
        </label>
        <label className="block">
          <span className="gg-eyebrow mb-1 block">To</span>
          <input type="date" name="to" defaultValue={to} className="gg-input" />
        </label>
        <button type="submit" className="gg-btn-primary">
          Update
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
        <table className="w-full text-sm">
          <thead className="gg-thead text-left">
            <tr>
              <th className="px-3 py-2.5">Material</th>
              <th className="px-3 py-2.5 text-right">Used</th>
              <th className="px-3 py-2.5 text-right">Cost</th>
              <th className="px-3 py-2.5 text-right">Made</th>
              <th className="px-3 py-2.5 text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300 font-ui">
            {usage.map((u) => (
              <tr key={u.material_id}>
                <td className="px-3 py-2.5 font-semibold text-navy-700">{u.name}</td>
                <td className="px-3 py-2.5 text-right text-navy-600">{u.total_used}</td>
                <td className="px-3 py-2.5 text-right text-navy-600">{money(u.cost)}</td>
                <td className="px-3 py-2.5 text-right text-navy-600">{money(u.revenue)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-success">
                  {money(u.profit)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-navy-200 bg-cream-200 font-bold text-navy-700">
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{totals.used}</td>
              <td className="px-3 py-2.5 text-right">{money(totals.cost)}</td>
              <td className="px-3 py-2.5 text-right">{money(totals.revenue)}</td>
              <td className="px-3 py-2.5 text-right">{money(totals.profit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

async function LeakageSection() {
  const jobs = await getLeakageJobs();
  async function emailAction(recipient: string) {
    'use server';
    return emailLeakageReport(recipient);
  }
  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Leakage</h2>
      <p className="mb-4 font-ui text-sm text-navy-500">
        For each completed job, enter what was actually charged. Leakage = used − charged, valued at
        the charge rate. Shows which crew leads need to tighten up on materials.
      </p>
      <EmailReport action={emailAction} />
      <LeakageEditor jobs={jobs} />
    </div>
  );
}

async function ReconcileSection() {
  const rows = await getDiscrepancies();
  const overnight = rows.filter((r) => r.is_overnight).length;
  async function emailAction(recipient: string) {
    'use server';
    return emailReconcileReport(recipient);
  }
  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Carry-Over Check</h2>
      <p className="mb-4 font-ui text-sm text-navy-500">
        Each job&apos;s <strong>pre-dispatch</strong> count should match the prior job&apos;s{' '}
        <strong>post-job</strong> count on that truck. <strong>Overnight</strong> mismatches mean
        material went missing or was miscounted while the truck sat; a negative diff means it came up
        short.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-navy-700 px-3 py-1 font-ui text-sm font-semibold text-cream-100">
          {rows.length} discrepanc{rows.length === 1 ? 'y' : 'ies'}
        </span>
        {overnight > 0 && (
          <span className="rounded-full bg-red-500 px-3 py-1 font-ui text-sm font-semibold text-cream-100">
            {overnight} overnight
          </span>
        )}
      </div>

      <EmailReport action={emailAction} />

      {rows.length === 0 ? (
        <div className="gg-card p-6 text-center">
          <p className="font-display text-lg font-bold text-success">No discrepancies 🎉</p>
          <p className="font-ui text-sm text-navy-500">
            Every pre-dispatch count matched the prior post-job count.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
          <table className="w-full text-sm">
            <thead className="gg-thead text-left">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Truck</th>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5 text-right">Expected</th>
                <th className="px-3 py-2.5 text-right">Counted</th>
                <th className="px-3 py-2.5 text-right">Diff</th>
                <th className="px-3 py-2.5">Gap</th>
                <th className="px-3 py-2.5">Crew Lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300 font-ui">
              {rows.map((r, i) => (
                <tr key={`${r.job_id}-${i}`} className={r.is_overnight ? 'bg-red-100/40' : ''}>
                  <td className="px-3 py-2.5 text-navy-700">{r.job_date}</td>
                  <td className="px-3 py-2.5 text-navy-700">{r.truck_name}</td>
                  <td className="px-3 py-2.5 font-semibold text-navy-700">{r.material_name}</td>
                  <td className="px-3 py-2.5 text-right text-navy-500">{r.expected}</td>
                  <td className="px-3 py-2.5 text-right text-navy-700">{r.counted}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-bold ${
                      r.diff < 0 ? 'text-red-500' : 'text-navy-600'
                    }`}
                  >
                    {r.diff > 0 ? '+' : ''}
                    {r.diff}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.is_overnight ? (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-cream-100">
                        Overnight
                      </span>
                    ) : (
                      <span className="font-ui text-xs text-navy-400">Same-day</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-navy-600">{r.crew_lead ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
