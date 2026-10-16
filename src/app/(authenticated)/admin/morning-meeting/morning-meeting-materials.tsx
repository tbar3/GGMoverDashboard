'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import type {
  MaterialsCheck,
  MaterialsCountCheck,
  MaterialsChargeJob,
} from '@/lib/morning-meeting-shared';
import { saveMaterialsCharged } from '@/lib/morning-meeting-actions';

function qty(v: number | null): string {
  return v == null ? '—' : String(Number(v.toFixed(2)));
}
function signed(v: number | null): string {
  if (v == null) return '—';
  return v > 0 ? `+${qty(v)}` : qty(v);
}
function money(v: number | null): string {
  if (v == null) return '—';
  const abs = `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return v < -0.004 ? `−${abs}` : v > 0.004 ? `+${abs}` : abs;
}
function day(d: string): string {
  return formatDate(`${d}T00:00:00.000Z`, 'EEE, MMM d');
}
/** Negative = short (red), positive = over (amber for counts, green for charges). */
function tone(v: number | null, positive: 'amber' | 'green'): string {
  if (v == null || Math.abs(v) < 0.001) return '';
  if (v < 0) return 'text-destructive font-semibold';
  return positive === 'green'
    ? 'text-green-600 dark:text-green-500 font-semibold'
    : 'text-amber-600 dark:text-amber-500 font-semibold';
}

export function MaterialsCheckSection({ check }: { check: MaterialsCheck }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Materials Check
        </CardTitle>
        <CardDescription>
          Are we leaking materials between jobs, and was everything the crew used charged in
          SmartMoving?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {check.counts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No materials sheets yet.</p>
        ) : (
          <>
            <section className="space-y-4">
              <h3 className="font-semibold">1 &middot; Count check</h3>
              <p className="text-xs text-muted-foreground">
                Per truck: the final count from its previous working day&apos;s last job (minus anything
                offloaded since) vs. the initial count from its latest day&apos;s first job. Red = missing,
                amber = more than expected.
              </p>
              {check.counts.map((c) => (
                <CountTable key={c.truck_id} check={c} />
              ))}
            </section>

            {check.jobDay && (
              <section className="space-y-4">
                <h3 className="font-semibold">2 &middot; Used vs. charged &middot; {day(check.jobDay)}</h3>
                <p className="text-xs text-muted-foreground">
                  Enter what SmartMoving charged — it saves as you go and fills the Leakage report too.
                  Difference = charged − used; negative means we gave material away.
                </p>
                {check.charges.map((j) => (
                  <ChargeTable key={j.job_id} job={j} />
                ))}
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CountTable({ check }: { check: MaterialsCountCheck }) {
  const rows = check.lines.filter((l) => l.prior_final != null || l.initial != null || l.offloaded !== 0);
  const off = rows.filter((l) => l.diff != null && Math.abs(l.diff) >= 0.001).length;
  const prior = check.prior;

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div>
          <p className="font-medium">{check.truck_name}</p>
          <p className="text-xs text-muted-foreground">
            {prior ? (
              <>
                Final: {day(prior.job_date)} &middot;{' '}
                <Link href={`/materials/jobs/${prior.job_id}`} className="underline underline-offset-2">
                  {prior.job_label}
                </Link>
              </>
            ) : (
              'No job before this one'
            )}{' '}
            &rarr; Initial: {day(check.last.job_date)} &middot;{' '}
            <Link href={`/materials/jobs/${check.last.job_id}`} className="underline underline-offset-2">
              {check.last.job_label}
            </Link>
          </p>
        </div>
        {!prior ? (
          <Badge variant="outline">Nothing to compare</Badge>
        ) : !prior.closed ? (
          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-500">
            {day(prior.job_date)} sheet never closed — no final count
          </Badge>
        ) : !check.last.counted ? (
          <Badge variant="outline">Last job not counted</Badge>
        ) : off === 0 ? (
          <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-500">
            All match
          </Badge>
        ) : (
          <Badge variant="destructive">{off} off</Badge>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-medium">Material</th>
                <th className="px-2 py-2 text-right font-medium">Final (prior day)</th>
                <th className="px-2 py-2 text-right font-medium">Offloaded</th>
                <th className="px-2 py-2 text-right font-medium">Expected</th>
                <th className="px-2 py-2 text-right font-medium">Initial (next day)</th>
                <th className="px-4 py-2 text-right font-medium">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.material_id} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{l.name}</td>
                  <td className="px-2 py-1.5 text-right">{qty(l.prior_final)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {l.offloaded ? qty(l.offloaded) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">{qty(l.expected)}</td>
                  <td className="px-2 py-1.5 text-right">{qty(l.initial)}</td>
                  <td className={`px-4 py-1.5 text-right ${tone(l.diff, 'amber')}`}>{signed(l.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChargeTable({ job }: { job: MaterialsChargeJob }) {
  const label = [job.job_number ? `#${job.job_number}` : null, job.customer].filter(Boolean).join(' · ');
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(job.lines.map((l) => [l.material_id, l.charged == null ? '' : String(l.charged)]))
  );
  // Last value the server accepted, per material — blur fires even when nothing
  // changed, and re-saving an unchanged field is pointless churn.
  const saved = useRef<Record<number, number | null>>(
    Object.fromEntries(job.lines.map((l) => [l.material_id, l.charged]))
  );

  async function commit(materialId: number) {
    const raw = values[materialId]?.trim() ?? '';
    const charged = raw === '' ? null : Number(raw);
    if (charged != null && (!Number.isFinite(charged) || charged < 0)) {
      toast.error('Charged must be zero or more');
      return;
    }
    if (charged === saved.current[materialId]) return;
    const res = await saveMaterialsCharged({ jobId: job.job_id, entries: [{ materialId, charged }] });
    if (!res.ok) toast.error(res.error || 'Save failed');
    else saved.current[materialId] = charged;
  }

  const rows = job.lines.map((l) => {
    const raw = values[l.material_id]?.trim() ?? '';
    const charged = raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
    // Nothing used and nothing charged is a true zero, not a blank.
    const used = l.used ?? (charged != null ? 0 : null);
    const diff = charged == null || used == null ? null : charged - used;
    return { ...l, diff, dollars: diff == null ? null : diff * l.charge_per_unit };
  });
  const total = rows.reduce((t, r) => t + (r.dollars ?? 0), 0);
  const anyDiff = rows.some((r) => r.dollars != null);

  return (
    <div className="rounded-lg border" data-job-number={job.job_number ?? undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div>
          <p className="font-medium">
            {job.truck_name}
            {label && <span className="font-normal text-muted-foreground"> &middot; {label}</span>}
          </p>
          {job.status !== 'complete' && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              Sheet not closed — used may be incomplete &middot;{' '}
              <Link href={`/materials/jobs/${job.job_id}`} className="underline underline-offset-2">
                open sheet
              </Link>
            </p>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-medium">Material</th>
              <th className="px-2 py-2 text-right font-medium">Used</th>
              <th className="px-2 py-2 text-right font-medium">Charged (SmartMoving)</th>
              <th className="px-2 py-2 text-right font-medium">Difference</th>
              <th className="px-4 py-2 text-right font-medium">$</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.material_id} className="border-b">
                <td className="px-4 py-1.5">{r.name}</td>
                <td className="px-2 py-1.5 text-right">{qty(r.used)}</td>
                <td className="px-2 py-1 text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    aria-label={`Charged ${r.name} for ${label || `${job.truck_name} job ${job.sequence_no}`}`}
                    name={`charged-${job.job_id}-${r.material_id}`}
                    value={values[r.material_id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [r.material_id]: e.target.value }))}
                    onBlur={() => commit(r.material_id)}
                    className="ml-auto h-8 w-20 text-right"
                  />
                </td>
                <td className={`px-2 py-1.5 text-right ${tone(r.diff, 'green')}`}>{signed(r.diff)}</td>
                <td className={`px-4 py-1.5 text-right ${tone(r.dollars, 'green')}`}>{money(r.dollars)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <td className="px-4 py-2" colSpan={4}>
                Total
              </td>
              <td className={`px-4 py-2 text-right ${tone(anyDiff ? total : null, 'green')}`}>
                {anyDiff ? money(total) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
