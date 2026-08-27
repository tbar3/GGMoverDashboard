import { format, startOfWeek } from 'date-fns';

/**
 * Parser for a SmartMoving jobs/revenue export, feeding the Week Summary's jobs
 * count and total revenue (and therefore the labor-cost ratio).
 *
 * Unlike the payroll detail report, the exact column layout here isn't pinned down
 * — SmartMoving's job exports vary by report and by the columns you tick. So this
 * does NOT hard-code a schema: it scores every header against alias lists, proposes
 * a mapping, and hands both the proposal and the full header list to the UI so a
 * human confirms (or corrects) before anything is written. Guessing silently is the
 * one thing an importer feeding a finance metric must not do.
 *
 * Pure: takes the raw 2-D matrix (XLSX sheet_to_json with header:1).
 */

export type Matrix = unknown[][];

export interface ParsedJobsReport {
  headerRow: number;
  headers: string[];
  rows: unknown[][];
  warnings: string[];
}

export interface ColumnMapping {
  /** Column index holding the job date — decides which week a job belongs to. */
  date: number;
  /** Column index holding the revenue figure to sum. */
  revenue: number;
  /** Optional job identifier, so multi-row jobs are counted once. -1 = count rows. */
  jobId: number;
  /** Optional status column used to exclude non-performed jobs. -1 = no filter. */
  status: number;
}

export interface WeekAggregate {
  weekStart: string;
  jobs: number;
  revenue: number;
  rowCount: number;
  firstDate: string;
  lastDate: string;
}

// Header aliases, most specific first — an earlier alias outranks a later one, and
// an exact match outranks a partial. Tuned against a real SmartMoving "all jobs"
// export (91 columns), where loose matching is actively dangerous: a bare 'amount'
// alias matches "Tip Amount" and "Actual Tax Amount", and a bare 'total' matches
// "Total Estimated Time Hours". The exact SmartMoving headers therefore lead.
const DATE_ALIASES = [
  'job date', 'move date', 'service date', 'scheduled date', 'start date',
  'jobdate', 'movedate', 'date',
];
const REVENUE_ALIASES = [
  // "Total Actual Cost" is SmartMoving's term for what the customer was actually
  // billed — the revenue figure. "Total Estimated Cost" is the quote, so it ranks
  // below it and is only chosen when no actual column exists.
  'total actual cost', 'total revenue', 'job total', 'grand total', 'total charges',
  'total price', 'actual total', 'revenue', 'invoice total', 'total estimated cost',
];
const JOB_ID_ALIASES = [
  'job number', 'job #', 'job no', 'jobnumber', 'job id', 'opportunity id',
  'invoice number',
];
// Jobs that never happened still appear as rows, so the status column is what keeps
// Lost/Cancelled/unbooked opportunities out of the count and the revenue.
const STATUS_ALIASES = ['opportunity status', 'job status', 'status'];

/** Statuses counted as real, performed work unless the reviewer says otherwise. */
export const DEFAULT_INCLUDED_STATUSES = ['closed', 'completed', 'finished'];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellText(c: unknown): string {
  if (c == null) return '';
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}

/**
 * Score one header against an alias list. Exact match beats prefix beats contains,
 * and earlier aliases outrank later ones so "total revenue" wins over bare "total".
 */
function scoreHeader(header: string, aliases: string[]): number {
  const h = norm(header);
  if (!h) return 0;
  for (let i = 0; i < aliases.length; i++) {
    const a = norm(aliases[i]);
    const rank = aliases.length - i; // earlier alias => higher rank
    if (h === a) return 1000 + rank;
    if (h.startsWith(a) || h.endsWith(a)) return 500 + rank;
    if (h.includes(a)) return 100 + rank;
  }
  return 0;
}

function bestColumn(headers: string[], aliases: string[], exclude: number[] = []): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < headers.length; i++) {
    if (exclude.includes(i)) continue;
    const s = scoreHeader(headers[i], aliases);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

export function toNumber(c: unknown): number {
  if (c == null) return 0;
  if (typeof c === 'number') return c;
  let s = String(c).trim();
  if (!s || s === '-' || s === '--') return 0;
  // Accounting negatives: (1,234.56)
  const parenthesised = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return parenthesised ? -n : n;
}

/** Excel serial → Date (epoch 1899-12-30). */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

export function toISODate(c: unknown): string | null {
  if (c == null || c === '') return null;
  let d: Date | null = null;
  if (c instanceof Date) {
    d = c;
  } else if (typeof c === 'number') {
    // Guard against a job NUMBER being mapped to the date column by mistake.
    if (c < 20000 || c > 80000) return null;
    d = serialToDate(c);
  } else {
    const s = String(c).trim();
    const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (mdy) {
      const [, mm, dd, yy] = mdy;
      const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), 12);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      d = new Date(`${s.slice(0, 10)}T12:00:00`);
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2000 || year > 2100) return null;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Find the header row and return it with the data rows beneath. The header is the
 * first row in the first 15 that has several non-empty text cells and at least one
 * recognisable date-ish or revenue-ish column — SmartMoving exports often carry a
 * title/filter block above the real header.
 */
export function parseJobsReport(matrix: Matrix): ParsedJobsReport {
  const warnings: string[] = [];
  let headerRow = -1;

  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] ?? [];
    const texts = row.map(cellText);
    const filled = texts.filter((t) => t !== '').length;
    if (filled < 2) continue;
    const looksLikeHeader =
      bestColumn(texts, DATE_ALIASES) >= 0 || bestColumn(texts, REVENUE_ALIASES) >= 0;
    if (looksLikeHeader) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    return {
      headerRow: -1,
      headers: [],
      rows: [],
      warnings: ['Could not find a header row with a recognisable date or revenue column.'],
    };
  }

  const headers = (matrix[headerRow] ?? []).map(cellText);
  const rows: unknown[][] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const texts = row.map(cellText);
    if (texts.every((t) => t === '')) continue;
    // Drop trailing "Total"/"Grand Total" summary lines so they aren't counted as jobs.
    const first = texts.find((t) => t !== '') ?? '';
    if (/^(grand\s+)?totals?$/i.test(first)) continue;
    rows.push(row);
  }

  if (rows.length === 0) warnings.push('No data rows found under the header.');
  return { headerRow, headers, rows, warnings };
}

/** Propose a column mapping from the headers. Any field may come back as -1. */
export function detectColumns(headers: string[]): ColumnMapping {
  const date = bestColumn(headers, DATE_ALIASES);
  const revenue = bestColumn(headers, REVENUE_ALIASES, [date]);
  const jobId = bestColumn(headers, JOB_ID_ALIASES, [date, revenue]);
  const status = bestColumn(headers, STATUS_ALIASES, [date, revenue, jobId]);
  return { date, revenue, jobId, status };
}

/** Every distinct value in the status column, with row counts, for the preview UI. */
export function statusBreakdown(rows: unknown[][], statusCol: number): { status: string; rows: number }[] {
  if (statusCol < 0) return [];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = cellText(r[statusCol]) || '(blank)';
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, n]) => ({ status, rows: n }))
    .sort((a, b) => b.rows - a.rows);
}

/**
 * Roll the rows up per Monday-anchored week. Jobs are counted by distinct job id
 * when one is mapped (a report with a row per line-item would otherwise inflate the
 * count); revenue for such a report is still summed across every row, and a
 * duplicate-id warning tells the reviewer when that distinction mattered.
 */
export function aggregateJobsByWeek(
  rows: unknown[][],
  mapping: ColumnMapping,
  includedStatuses: string[] = DEFAULT_INCLUDED_STATUSES
): { weeks: WeekAggregate[]; skipped: number; excluded: number; warnings: string[] } {
  const warnings: string[] = [];
  const byWeek = new Map<
    string,
    { revenue: number; ids: Set<string>; rowCount: number; dates: string[] }
  >();
  let skipped = 0;
  let excluded = 0;
  let duplicateIds = 0;

  const allowed = new Set(includedStatuses.map((s) => s.toLowerCase()));
  const filtering = mapping.status >= 0 && allowed.size > 0;

  for (const row of rows) {
    // A jobs export lists every opportunity, including ones that never happened.
    // Counting those would inflate the job count and wreck the labour ratio.
    if (filtering && !allowed.has(cellText(row[mapping.status]).toLowerCase())) {
      excluded++;
      continue;
    }
    const iso = toISODate(row[mapping.date]);
    if (!iso) {
      skipped++;
      continue;
    }
    const weekStart = format(startOfWeek(new Date(`${iso}T12:00:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    let bucket = byWeek.get(weekStart);
    if (!bucket) {
      bucket = { revenue: 0, ids: new Set(), rowCount: 0, dates: [] };
      byWeek.set(weekStart, bucket);
    }
    bucket.revenue += mapping.revenue >= 0 ? toNumber(row[mapping.revenue]) : 0;
    bucket.rowCount++;
    bucket.dates.push(iso);
    if (mapping.jobId >= 0) {
      const id = cellText(row[mapping.jobId]);
      if (id) {
        if (bucket.ids.has(id)) duplicateIds++;
        bucket.ids.add(id);
      }
    }
  }

  if (excluded > 0) {
    warnings.push(
      `${excluded} row(s) excluded by status — jobs that were not performed (lost, cancelled, still an open opportunity).`
    );
  }
  if (skipped > 0) warnings.push(`${skipped} row(s) had no readable date and were skipped.`);
  if (duplicateIds > 0) {
    warnings.push(
      `${duplicateIds} row(s) repeated a job number — jobs are counted once each, revenue is summed across all rows.`
    );
  }

  const weeks = Array.from(byWeek.entries())
    .map(([weekStart, b]) => {
      const dates = b.dates.slice().sort();
      return {
        weekStart,
        jobs: mapping.jobId >= 0 && b.ids.size > 0 ? b.ids.size : b.rowCount,
        revenue: Math.round(b.revenue * 100) / 100,
        rowCount: b.rowCount,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return { weeks, skipped, excluded, warnings };
}
