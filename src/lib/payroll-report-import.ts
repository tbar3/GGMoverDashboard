import { format } from 'date-fns';

/**
 * Parser + weekly aggregator for the raw SmartMoving **payroll detail** report
 * (one row per employee, per job, per day). This is different from the
 * "Payroll Summary" export (see payroll-import.ts): the summary is already
 * rolled up per employee/week, whereas this report is the granular source we
 * aggregate ourselves so the crew can stop maintaining the Excel dashboard.
 *
 * Raw columns (row-1 header): EMPLOYEE, NUMBER, BRANCH, DATE, DESCRIPTION,
 * many "* COMMISSION" columns, HOURS, HOURLY RATE, HOURLY EARNINGS, TIPS,
 * LUMP SUM PAYMENTS, CREW BONUS, DEDUCTIONS, TOTAL.
 *
 * Pure: takes the raw 2-D matrix (XLSX sheet_to_json with header:1). DB name
 * resolution (aliases), warehouse/lunch/OT/bonus, and persistence live elsewhere.
 */

export interface RawReportRow {
  name: string;
  date: string | null; // yyyy-MM-dd
  hours: number;
  hourlyRate: number; // 0 on commission-only (sales) rows
  hourlyEarnings: number;
  tips: number;
  lumpSum: number;
  crewBonus: number;
  commissions: number; // Σ of every "* COMMISSION" column on the row
  deductions: number;
}

export interface ParsedRawReport {
  rows: RawReportRow[];
  warnings: string[];
}

/** Per-employee weekly rollup (before warehouse/marketing/OT/bonus are added). */
export interface EmployeeAggregate {
  key: string; // canonical grouping key (employee id, or lowercased name in tests)
  names: string[]; // every raw display name that mapped here (e.g. "Cam Woods" + "Cameron Woods")
  jobHours: number; // Σ HOURS
  jobDays: string[]; // distinct yyyy-MM-dd with hours > 0
  hourlyEarnings: number; // Σ HOURLY EARNINGS
  tips: number;
  commissions: number; // Σ commission columns + Σ lump-sum payments
  crewBonus: number; // report's CREW BONUS column (informational)
  deductions: number;
  rates: number[]; // distinct non-zero HOURLY RATE values seen (for the multi-rate audit)
  standardRate: number; // the rate under which the most hours were worked
}

type Cell = unknown;
type Matrix = Cell[][];

function cellText(c: Cell): string {
  if (c == null) return '';
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}

function toNumber(c: Cell): number {
  if (c == null) return 0;
  if (typeof c === 'number') return c;
  const s = String(c).replace(/[$,\s]/g, '');
  if (s === '' || s === '-' || s === '--') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Excel serial → Date (epoch 1899-12-30). */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/** Coerce a date-ish cell (Date | Excel serial | "M/D/YYYY" | "yyyy-mm-dd") to yyyy-MM-dd. */
function toISODate(c: Cell): string | null {
  if (c == null || c === '') return null;
  let d: Date | null = null;
  if (c instanceof Date) {
    d = c;
  } else if (typeof c === 'number') {
    d = serialToDate(c);
  } else {
    const s = String(c).trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (mdy) {
      const [, mm, dd, yy] = mdy;
      const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), 12);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      d = new Date(`${s.slice(0, 10)}T12:00:00`);
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

interface ColMap {
  employee: number;
  date: number;
  hours: number;
  rate: number;
  earnings: number;
  tips: number;
  lumpSum: number;
  crewBonus: number;
  deductions: number;
  commissionCols: number[];
}

function mapColumns(header: Cell[]): ColMap | null {
  const map: ColMap = {
    employee: -1, date: -1, hours: -1, rate: -1, earnings: -1,
    tips: -1, lumpSum: -1, crewBonus: -1, deductions: -1, commissionCols: [],
  };
  for (let c = 0; c < header.length; c++) {
    const h = cellText(header[c]).toLowerCase();
    if (!h) continue;
    if (h === 'employee') map.employee = c;
    else if (h === 'date') map.date = c;
    else if (h === 'hours') map.hours = c;
    else if (h === 'hourly rate') map.rate = c;
    else if (h === 'hourly earnings') map.earnings = c;
    else if (h === 'tips') map.tips = c;
    else if (h.includes('lump sum')) map.lumpSum = c;
    else if (h === 'crew bonus') map.crewBonus = c;
    else if (h === 'deductions') map.deductions = c;
    else if (h.includes('commission')) map.commissionCols.push(c);
  }
  return map.employee >= 0 && map.hours >= 0 ? map : null;
}

/** Parse the raw detail report into flat per-row records. */
export function parseRawPayrollReport(matrix: Matrix): ParsedRawReport {
  const warnings: string[] = [];

  // The header is on (or near) the first row; scan the first few just in case.
  let headerIdx = -1;
  let cols: ColMap | null = null;
  for (let i = 0; i < Math.min(matrix.length, 5); i++) {
    const c = mapColumns(matrix[i] ?? []);
    if (c) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx === -1 || !cols) {
    return {
      rows: [],
      warnings: ['Could not find the EMPLOYEE / HOURS header — is this the SmartMoving payroll detail report?'],
    };
  }

  const rows: RawReportRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    const name = cellText(raw[cols.employee]);
    if (!name) continue; // skip blank lines
    if (/^totals?$/i.test(name)) continue;

    const commissions = cols.commissionCols.reduce((sum, c) => sum + toNumber(raw[c]), 0);
    rows.push({
      name,
      date: toISODate(raw[cols.date]),
      hours: toNumber(raw[cols.hours]),
      hourlyRate: toNumber(raw[cols.rate]),
      hourlyEarnings: toNumber(raw[cols.earnings]),
      tips: cols.tips >= 0 ? toNumber(raw[cols.tips]) : 0,
      lumpSum: cols.lumpSum >= 0 ? toNumber(raw[cols.lumpSum]) : 0,
      crewBonus: cols.crewBonus >= 0 ? toNumber(raw[cols.crewBonus]) : 0,
      commissions,
      deductions: cols.deductions >= 0 ? toNumber(raw[cols.deductions]) : 0,
    });
  }

  if (rows.length === 0) warnings.push('No data rows found under the header.');
  return { rows, warnings };
}

/**
 * Roll parsed rows up per employee for the week. `keyFor` maps a raw display name
 * to a canonical grouping key — in the route it resolves aliases to an employee id
 * ("Cam Woods" and "Cameron Woods" → same id); in tests it can be the lowercased name.
 * Rows whose key is null are dropped (caller collects them as unmatched).
 */
export function aggregateByEmployee(
  rows: RawReportRow[],
  keyFor: (name: string) => string | null
): EmployeeAggregate[] {
  const map = new Map<string, EmployeeAggregate & { _rateHours: Map<number, number>; _days: Set<string> }>();

  for (const r of rows) {
    const key = keyFor(r.name);
    if (!key) continue;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key, names: [], jobHours: 0, jobDays: [], hourlyEarnings: 0, tips: 0,
        commissions: 0, crewBonus: 0, deductions: 0, rates: [], standardRate: 0,
        _rateHours: new Map(), _days: new Set(),
      };
      map.set(key, agg);
    }
    if (!agg.names.includes(r.name)) agg.names.push(r.name);
    agg.jobHours += r.hours;
    agg.hourlyEarnings += r.hourlyEarnings;
    agg.tips += r.tips;
    agg.commissions += r.commissions + r.lumpSum;
    agg.crewBonus += r.crewBonus;
    agg.deductions += r.deductions;
    if (r.hours > 0 && r.date) agg._days.add(r.date);
    if (r.hours > 0 && r.hourlyRate > 0) {
      agg._rateHours.set(r.hourlyRate, (agg._rateHours.get(r.hourlyRate) ?? 0) + r.hours);
    }
  }

  return Array.from(map.values()).map((a) => {
    // Standard rate = the rate under which the most hours were worked.
    let standardRate = 0;
    let best = -1;
    for (const [rate, hrs] of a._rateHours) {
      if (hrs > best) {
        best = hrs;
        standardRate = rate;
      }
    }
    const jobDays = Array.from(a._days).sort();
    return {
      key: a.key,
      names: a.names,
      jobHours: round2(a.jobHours),
      jobDays,
      hourlyEarnings: round2(a.hourlyEarnings),
      tips: round2(a.tips),
      commissions: round2(a.commissions),
      crewBonus: round2(a.crewBonus),
      deductions: round2(a.deductions),
      rates: Array.from(a._rateHours.keys()).sort((x, y) => x - y),
      standardRate,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
