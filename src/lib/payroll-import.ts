import { format } from 'date-fns';

/**
 * Parser for the weekly "Payroll Summary" export.
 *
 * The file is a spreadsheet, not a clean table: a 4-row header block (Today /
 * Payroll Start / Payroll End / Check Date), a couple of label rows, then a real
 * header row beginning with "EMPLOYEE", then one row per employee, then audit
 * columns off to the right that we ignore. We locate the EMPLOYEE header row,
 * map columns by their labels, and read the contiguous employee block.
 *
 * Pure: takes the raw 2-D matrix (XLSX sheet_to_json with header:1) and returns
 * structured rows. DB matching/upsert happens in the route.
 */

export interface ParsedPayrollRow {
  name: string;
  billableHours: number;
  warehouseHours: number;
  marketingHours: number;
  totalHours: number;
  overtimeHours: number;
  standardRate: number;
  standardPay: number;
  overtimeRate: number;
  overtimePay: number;
  tips: number;
  bonus: number;
  commissions: number;
  lunch: number;
  miles: number;
  totalCompensation: number;
}

export interface ParsedPayroll {
  periodStart: string | null; // yyyy-MM-dd
  periodEnd: string | null;
  checkDate: string | null;
  rows: ParsedPayrollRow[];
  warnings: string[];
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
  if (s === '' || s === '-') return 0;
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

type NumericField = Exclude<keyof ParsedPayrollRow, 'name'>;

// Map a header-cell label to a field key. Order matters — check the most specific
// substrings first so "Total Hours" never matches the "Total Compensation" branch.
function fieldForHeader(label: string): NumericField | null {
  const h = label.toLowerCase();
  if (h.includes('billable')) return 'billableHours';
  if (h.includes('warehouse')) return 'warehouseHours';
  if (h.includes('marketing')) return 'marketingHours';
  if (h.includes('total hours')) return 'totalHours';
  if (h.includes('overtime hours')) return 'overtimeHours';
  if (h.includes('standard rate')) return 'standardRate';
  if (h.includes('standard pay')) return 'standardPay';
  if (h.includes('overtime rate')) return 'overtimeRate';
  if (h.includes('overtime pay')) return 'overtimePay';
  if (h.includes('total compensation')) return 'totalCompensation';
  if (h === 'tips' || h === 'tip') return 'tips';
  if (h === 'bonus') return 'bonus';
  if (h.includes('commission')) return 'commissions';
  if (h === 'lunch') return 'lunch';
  if (h === 'miles') return 'miles';
  return null;
}

const NUMERIC_FIELDS: NumericField[] = [
  'billableHours', 'warehouseHours', 'marketingHours', 'totalHours', 'overtimeHours',
  'standardRate', 'standardPay', 'overtimeRate', 'overtimePay',
  'tips', 'bonus', 'commissions', 'lunch', 'miles', 'totalCompensation',
];

export function parsePayrollSummary(matrix: Matrix): ParsedPayroll {
  const warnings: string[] = [];

  // 1. Period dates from the header block — find labels in the first column-ish cells.
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let checkDate: string | null = null;
  let headerRowIdx = -1;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const label = cellText(row[0]).toLowerCase();
    if (label.includes('payroll start')) periodStart = toISODate(row[1]);
    else if (label.includes('payroll end')) periodEnd = toISODate(row[1]);
    else if (label === 'check date' || label.includes('check date')) checkDate = toISODate(row[1]);
    if (label === 'employee') {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    warnings.push('Could not find the EMPLOYEE header row — is this the Payroll Summary export?');
    return { periodStart, periodEnd, checkDate, rows: [], warnings };
  }

  // 2. Map columns by their header labels. Name is always column 0; stop mapping
  //    once we hit Total Compensation so the audit columns to its right are ignored.
  const header = matrix[headerRowIdx];
  const colMap = new Map<number, NumericField>();
  for (let c = 1; c < header.length; c++) {
    const field = fieldForHeader(cellText(header[c]));
    if (field) {
      colMap.set(c, field);
      if (field === 'totalCompensation') break;
    }
  }

  // 3. Read the contiguous employee block until a blank name / a totals row.
  const rows: ParsedPayrollRow[] = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    const name = cellText(raw[0]);
    if (!name) break; // end of the block
    if (/^totals?$/i.test(name)) break;

    const row: ParsedPayrollRow = {
      name,
      billableHours: 0, warehouseHours: 0, marketingHours: 0, totalHours: 0, overtimeHours: 0,
      standardRate: 0, standardPay: 0, overtimeRate: 0, overtimePay: 0,
      tips: 0, bonus: 0, commissions: 0, lunch: 0, miles: 0, totalCompensation: 0,
    };
    for (const [c, field] of colMap) {
      row[field] = toNumber(raw[c]);
    }
    // If Total Hours wasn't in the file, derive it from the components.
    if (row.totalHours === 0) {
      const derived = row.billableHours + row.warehouseHours + row.marketingHours;
      if (derived > 0) row.totalHours = derived;
    }
    rows.push(row);
  }

  if (rows.length === 0) warnings.push('No employee rows found under the EMPLOYEE header.');
  if (!periodStart) warnings.push('Missing "Payroll Start Date" — cannot determine the pay week.');

  // Guard against a scrambled mapping.
  const mappedFields = new Set(colMap.values());
  const missing = NUMERIC_FIELDS.filter((f) => !mappedFields.has(f));
  if (missing.length > 8) {
    warnings.push(`Only mapped ${NUMERIC_FIELDS.length - missing.length} of ${NUMERIC_FIELDS.length} money/hours columns — check the file's headers.`);
  }

  return { periodStart, periodEnd, checkDate, rows, warnings };
}
