import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireBackOffice } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  parseJobsReport,
  detectColumns,
  aggregateJobsByWeek,
  statusBreakdown,
  DEFAULT_INCLUDED_STATUSES,
  type ColumnMapping,
} from '@/lib/jobs-report-import';

/**
 * Import a SmartMoving jobs export to fill the Week Summary's jobs count and total
 * revenue (which drive the labor-cost ratio and the dashboard trends).
 *
 * Two phases, both hitting this route with the file:
 *   - preview (default): parse, propose a column mapping, and return what WOULD be
 *     written, including the existing values it would replace. Nothing is saved.
 *   - commit=true: apply the confirmed mapping.
 * The preview step is deliberate — a jobs export lists lost and unbooked
 * opportunities alongside real work, and silently summing all of it would corrupt a
 * finance metric. A human confirms what counts before it lands.
 */
export const maxDuration = 300;

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

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const commit = formData.get('commit') === 'true';
  const mappingRaw = formData.get('mapping');
  const statusesRaw = formData.get('statuses');

  let matrix: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 400 }
    );
  }

  const parsed = parseJobsReport(matrix);
  if (parsed.headerRow === -1) {
    return NextResponse.json(
      { error: parsed.warnings[0] ?? 'Could not read this file as a jobs report.' },
      { status: 400 }
    );
  }

  // Use the confirmed mapping when one is supplied, otherwise propose one.
  let mapping: ColumnMapping = detectColumns(parsed.headers);
  if (typeof mappingRaw === 'string' && mappingRaw) {
    try {
      const m = JSON.parse(mappingRaw) as Partial<ColumnMapping>;
      const valid = (v: unknown) =>
        typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < parsed.headers.length;
      mapping = {
        date: valid(m.date) ? (m.date as number) : mapping.date,
        revenue: valid(m.revenue) ? (m.revenue as number) : mapping.revenue,
        jobId: valid(m.jobId) ? (m.jobId as number) : mapping.jobId,
        status: valid(m.status) ? (m.status as number) : mapping.status,
      };
    } catch {
      return NextResponse.json({ error: 'Bad column mapping' }, { status: 400 });
    }
  }

  if (mapping.date < 0) {
    return NextResponse.json(
      { error: 'No date column identified — pick the column holding the job date.', headers: parsed.headers },
      { status: 400 }
    );
  }

  let statuses = DEFAULT_INCLUDED_STATUSES;
  if (typeof statusesRaw === 'string' && statusesRaw) {
    try {
      const arr = JSON.parse(statusesRaw);
      if (Array.isArray(arr) && arr.every((s) => typeof s === 'string')) statuses = arr;
    } catch {
      /* fall back to the default set */
    }
  } else if (mapping.status >= 0) {
    // Default to whichever present statuses look like performed work.
    const present = statusBreakdown(parsed.rows, mapping.status).map((s) => s.status);
    statuses = present.filter((s) => DEFAULT_INCLUDED_STATUSES.includes(s.toLowerCase()));
  }

  const agg = aggregateJobsByWeek(parsed.rows, mapping, statuses);
  if (agg.weeks.length === 0) {
    return NextResponse.json(
      { error: 'No rows matched — check the date column and which statuses are included.' },
      { status: 400 }
    );
  }

  // What's already recorded for these weeks, so the preview can show replacements.
  const weekList = agg.weeks.map((w) => w.weekStart);
  const [existing, withPayroll] = await Promise.all([
    query<{ week_start: string; jobs: number | null; revenue: number | null }>(
      'SELECT week_start::text, jobs, revenue FROM payroll_week_summary WHERE week_start = ANY($1)',
      [weekList]
    ),
    query<{ week_start: string }>(
      'SELECT DISTINCT week_start::text FROM payroll_entries WHERE week_start = ANY($1)',
      [weekList]
    ),
  ]);
  const existingBy = new Map(existing.map((e) => [e.week_start, e]));
  const payrollWeeks = new Set(withPayroll.map((w) => w.week_start));

  const weeks: WeekPreview[] = agg.weeks.map((w) => {
    const e = existingBy.get(w.weekStart);
    return {
      ...w,
      existingJobs: e?.jobs == null ? null : Number(e.jobs),
      existingRevenue: e?.revenue == null ? null : Number(e.revenue),
      hasPayroll: payrollWeeks.has(w.weekStart),
    };
  });

  if (!commit) {
    return NextResponse.json({
      preview: true,
      headers: parsed.headers,
      mapping,
      statuses,
      statusBreakdown: statusBreakdown(parsed.rows, mapping.status),
      weeks,
      warnings: [...parsed.warnings, ...agg.warnings],
      totalRows: parsed.rows.length,
    });
  }

  // ── Commit ──────────────────────────────────────────────────
  let written = 0;
  for (const w of weeks) {
    await query(
      `INSERT INTO payroll_week_summary (week_start, jobs, revenue, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (week_start)
         DO UPDATE SET jobs = $2, revenue = $3, updated_by = $4, updated_at = NOW()`,
      [w.weekStart, w.jobs, w.revenue, guard.employee.id]
    );
    written++;

    // Same audit trail a hand-typed figure gets, tagged with the file it came from.
    for (const [field, oldValue, newValue] of [
      ['jobs', w.existingJobs, w.jobs],
      ['revenue', w.existingRevenue, w.revenue],
    ] as const) {
      try {
        await query(
          `INSERT INTO payroll_change_log
             (week_start, employee_id, employee_name, scope, field, old_value, new_value, changed_by, changed_by_name)
           VALUES ($1, NULL, NULL, 'week_summary', $2, $3, $4, $5, $6)`,
          [
            w.weekStart,
            field,
            oldValue == null ? null : String(oldValue),
            `${newValue} (imported from ${file.name})`,
            guard.employee.id,
            guard.employee.name,
          ]
        );
      } catch (err) {
        console.error('[jobs-report] change log write failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  return NextResponse.json({
    preview: false,
    written,
    weeks,
    warnings: [...parsed.warnings, ...agg.warnings],
  });
}
