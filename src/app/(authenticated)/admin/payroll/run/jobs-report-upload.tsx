'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Import a SmartMoving jobs export into the Week Summary (jobs + revenue).
 *
 * Two-step by design: upload previews what would be written — the columns it
 * matched, which job statuses count, and the values it would replace — and nothing
 * is saved until it's confirmed. A jobs export lists lost and unbooked
 * opportunities next to real work, so an unreviewed import would silently distort
 * the labor-cost ratio.
 */

interface WeekPreview {
  weekStart: string;
  jobs: number;
  revenue: number;
  rowCount: number;
  firstDate: string;
  lastDate: string;
  existingJobs: number | null;
  existingRevenue: number | null;
  hasPayroll: boolean;
}
interface Mapping {
  date: number;
  revenue: number;
  jobId: number;
  status: number;
}
interface Preview {
  headers: string[];
  mapping: Mapping;
  statuses: string[];
  statusBreakdown: { status: string; rows: number }[];
  weeks: WeekPreview[];
  warnings: string[];
  totalRows: number;
}

const FIELD_LABELS: { key: keyof Mapping; label: string; hint: string; optional?: boolean }[] = [
  { key: 'date', label: 'Job date', hint: 'decides which week a job counts toward' },
  { key: 'revenue', label: 'Revenue', hint: 'summed to give total revenue' },
  { key: 'jobId', label: 'Job number', hint: 'counts each job once', optional: true },
  { key: 'status', label: 'Status', hint: 'filters out jobs that never happened', optional: true },
];

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function JobsReportUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(f: File, opts: { commit?: boolean; mapping?: Mapping; statuses?: string[] }) {
    const fd = new FormData();
    fd.append('file', f);
    if (opts.commit) fd.append('commit', 'true');
    if (opts.mapping) fd.append('mapping', JSON.stringify(opts.mapping));
    if (opts.statuses) fd.append('statuses', JSON.stringify(opts.statuses));
    const res = await fetch('/api/payroll/jobs-report', { method: 'POST', body: fd });
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      throw new Error(
        (data?.error as string) ||
          `Upload failed (HTTP ${res.status})${text && !data ? `: ${text.slice(0, 200)}` : ''}`
      );
    }
    return data;
  }

  async function onFile(f: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const data = (await post(f, {})) as unknown as Preview;
      setFile(f);
      setPreview(data);
      setMapping(data.mapping);
      setStatuses(data.statuses);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload error';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  /** Re-preview whenever the reviewer changes a column or a status. */
  async function repreview(nextMapping: Mapping, nextStatuses: string[]) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await post(file, { mapping: nextMapping, statuses: nextStatuses })) as unknown as Preview;
      setPreview(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Preview error';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!file || !mapping) return;
    setBusy(true);
    try {
      const data = (await post(file, { commit: true, mapping, statuses })) as { written: number };
      toast.success(`Saved ${data.written} week${data.written === 1 ? '' : 's'}`);
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import error';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function setColumn(key: keyof Mapping, value: number) {
    if (!mapping) return;
    const next = { ...mapping, [key]: value };
    setMapping(next);
    repreview(next, statuses);
  }

  function toggleStatus(s: string) {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    setStatuses(next);
    repreview(mapping!, next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {busy ? 'Reading…' : 'Upload SmartMoving jobs report'}
        </Button>
        {preview && (
          <span className="text-sm text-muted-foreground">
            {file?.name} · {preview.totalRows} rows
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive whitespace-pre-wrap break-words">
          {error}
        </div>
      )}

      {preview && mapping && (
        <div className="rounded-lg border p-4 space-y-4">
          {/* Column mapping */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Columns matched — change any that look wrong
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELD_LABELS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-sm font-medium">
                    {f.label}
                    {f.optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
                  </label>
                  <select
                    value={mapping[f.key]}
                    disabled={busy}
                    onChange={(e) => setColumn(f.key, Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value={-1}>— none —</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `(column ${i + 1})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Status filter */}
          {preview.statusBreakdown.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Which jobs count as real work
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.statusBreakdown.map((s) => {
                  const on = statuses.includes(s.status);
                  return (
                    <button
                      key={s.status}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleStatus(s.status)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                        on
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {on && <Check className="h-3.5 w-3.5 text-primary" />}
                      {s.status}
                      <span className="text-xs text-muted-foreground">{s.rows}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* What will be written */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              What will be saved
            </p>
            <div className="space-y-2">
              {preview.weeks.map((w) => (
                <div
                  key={w.weekStart}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Week of {w.weekStart}</span>
                    {!w.hasPayroll && (
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-500">
                        no payroll imported
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 tabular-nums">
                    <span>
                      <span className="text-muted-foreground">Jobs </span>
                      <span className="font-semibold">{w.jobs}</span>
                      {w.existingJobs != null && w.existingJobs !== w.jobs && (
                        <span className="text-muted-foreground text-xs"> (was {w.existingJobs})</span>
                      )}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Revenue </span>
                      <span className="font-semibold">{money(w.revenue)}</span>
                      {w.existingRevenue != null && w.existingRevenue !== w.revenue && (
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          (was {money(w.existingRevenue)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-500 space-y-0.5">
              {preview.warnings.map((w, i) => (
                <li key={i}>
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <Button onClick={onConfirm} disabled={busy || mapping.revenue < 0}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save {preview.weeks.length} week{preview.weeks.length === 1 ? '' : 's'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setFile(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
