import { addDays, format } from 'date-fns';
import { query, queryOne } from '@/lib/db';
import { getPayrollRun, getWeekSummary, type PayrollDetailRow } from '@/lib/payroll-run';
import { WAREHOUSE_HOURS_PER_DAY, OT_WEEKLY_THRESHOLD } from '@/lib/payroll-compute';

/**
 * Read-only audit view over a Payroll Run week.
 *
 * The run itself is untouched — this calls getPayrollRun() and explains what came
 * back. For each employee it names the ORIGIN of every input (which system, which
 * file, whether a human overrode it), spells out the hours and pay arithmetic, and
 * ties the figure back to the exact ADP row it produced. On top of that it runs
 * reconciliation checks an F&A reviewer would otherwise do by hand in Excel, and
 * surfaces the append-only manual-change log.
 *
 * Nothing here can alter a payroll figure. If a check fails it is reported, never
 * corrected — the run stays the single source of truth.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function money(n: number): string {
  return n.toFixed(2);
}
/** Treat sub-cent gaps as agreement; anything larger is a real reconciliation break. */
function ties(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

export type InputKind = 'hours' | 'money' | 'rate';

export interface AuditInput {
  label: string;
  value: number;
  kind: InputKind;
  /** Where the number came from before any human touched it. */
  source: string;
  /** How it is derived, when it isn't just a field off the import. */
  derivation: string | null;
  overridden: boolean;
  /** What the system computed, when a human overrode it. */
  systemValue: number | null;
}

export interface AdpTie {
  table: 'ADP W-2' | 'ADP 1099' | null;
  columns: { label: string; value: number; kind: InputKind; from: string }[];
  /** Plain-English proof the ADP row reproduces the same gross. */
  check: string;
  ok: boolean;
  /** Dollars ADP over/under-pays purely from comp-hour rounding (1099 only). */
  roundingDrift?: number;
}

export interface EmployeeAudit {
  employeeId: string;
  name: string;
  classification: string | null;
  inputs: AuditInput[];
  hoursMath: string;
  payMath: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  rate: number;
  totalCompensation: number;
  adp: AdpTie;
  overriddenFields: string[];
  flags: string[];
}

export interface ReconciliationCheck {
  label: string;
  expected: number | string;
  actual: number | string;
  ok: boolean;
  detail: string;
}

export interface ChangeLogEntry {
  id: string;
  changedAt: string;
  employeeName: string | null;
  scope: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedByName: string | null;
}

export interface PayrollAudit {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  checkDate: string;
  provenance: {
    sourceFile: string | null;
    importedAt: string | null;
    employeeCount: number;
  };
  employees: EmployeeAudit[];
  checks: ReconciliationCheck[];
  changeLog: ChangeLogEntry[];
  runFlags: string[];
  totals: {
    billableHours: number;
    warehouseHours: number;
    marketingHours: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    tips: number;
    commissions: number;
    bonus: number;
    mileage: number;
    totalCompensation: number;
    w2Count: number;
    count1099: number;
    unclassified: number;
    overrideCount: number;
  };
}

/** The inputs behind one employee's week, each tagged with where it came from. */
function inputsFor(
  d: PayrollDetailRow,
  sourceFile: string | null,
  lateMinutes: number
): AuditInput[] {
  const report = sourceFile ? `SmartMoving payroll detail report (${sourceFile})` : 'SmartMoving payroll detail report';

  // Warehouse time is derived at import (0.5h per job-day, less that day's lateness),
  // and the job-day count isn't stored — so it is reported as implied, not asserted.
  const lateHours = round2(lateMinutes / 60);
  const impliedJobDays = Math.round((d.warehouseHours + lateHours) / WAREHOUSE_HOURS_PER_DAY);

  return [
    {
      label: 'Billable (job) hours',
      value: d.billableHours,
      kind: 'hours',
      source: report,
      derivation: 'Sum of the HOURS column across every job row for the week',
      overridden: false,
      systemValue: null,
    },
    {
      label: 'Warehouse hours',
      value: d.warehouseHours,
      kind: 'hours',
      source: d.ov.warehouse != null ? 'Manual override (Review & Correct)' : 'Computed at import',
      derivation:
        d.ov.warehouse != null
          ? null
          : `${WAREHOUSE_HOURS_PER_DAY}h per job-day${
              lateMinutes > 0 ? ` less ${lateMinutes} min lateness (${lateHours}h) from Attendance` : ''
            }, floored at 0 — implies ${impliedJobDays} job-day${impliedJobDays === 1 ? '' : 's'}`,
      overridden: d.ov.warehouse != null,
      systemValue: null,
    },
    {
      label: 'Marketing hours',
      value: d.marketingHours,
      kind: 'hours',
      source: 'Marketing Hours module (entered per person, per week)',
      derivation: null,
      overridden: false,
      systemValue: null,
    },
    {
      label: 'Hourly rate',
      value: d.rate,
      kind: 'rate',
      source: report,
      derivation: 'The rate under which the most hours were worked; falls back to the roster rate',
      overridden: false,
      systemValue: null,
    },
    {
      label: 'Tips',
      value: d.tips,
      kind: 'money',
      source: d.ov.tips != null ? 'Manual override (Review & Correct)' : report,
      derivation: null,
      overridden: d.ov.tips != null,
      systemValue: null,
    },
    {
      label: 'Commissions',
      value: d.commissions,
      kind: 'money',
      source: d.ov.commissions != null ? 'Manual override (Review & Correct)' : report,
      derivation: d.ov.commissions != null ? null : 'Sum of every "* COMMISSION" column plus lump-sum payments',
      overridden: d.ov.commissions != null,
      systemValue: null,
    },
    {
      label: 'Weekly bonus',
      value: d.bonus,
      kind: 'money',
      source: d.ov.bonus != null ? 'Manual override (Review & Correct)' : 'Weekly bonus engine',
      derivation:
        d.ov.bonus != null
          ? null
          : 'Bonus hours x base rate x multiplier — see the Weekly Bonus report for the multiplier build-up',
      overridden: d.ov.bonus != null,
      systemValue: d.ov.bonus != null ? d.computedBonus : null,
    },
    {
      label: 'Mileage reimbursement',
      value: d.miles,
      kind: 'money',
      source: d.ov.miles != null ? 'Manual override (Review & Correct)' : 'Mileage module (logged entries for the week)',
      derivation: null,
      overridden: d.ov.miles != null,
      systemValue: null,
    },
  ];
}

/** How this employee's figures land in ADP, and the proof the row reproduces the gross. */
function adpTieFor(d: PayrollDetailRow): AdpTie {
  const basePay = round2(d.totalHours * d.rate + d.overtimeHours * (d.rate / 2));
  const earnings = round2(d.tips + d.commissions + d.bonus);

  if (d.classification === 'W-2') {
    // ADP applies the 1.5x itself, so reg + OT at 1.5x must reproduce our base pay.
    const adpGross = round2(d.regularHours * d.rate + d.overtimeHours * d.rate * 1.5);
    return {
      table: 'ADP W-2',
      columns: [
        { label: 'Regular Hours', value: d.regularHours, kind: 'hours', from: `total hours capped at ${OT_WEEKLY_THRESHOLD}` },
        { label: 'Overtime Hours', value: d.overtimeHours, kind: 'hours', from: `hours above ${OT_WEEKLY_THRESHOLD}` },
        { label: 'Tips', value: d.tips, kind: 'money', from: 'tips' },
        { label: 'Bonus', value: d.bonus, kind: 'money', from: 'weekly bonus' },
        { label: 'Commissions', value: d.commissions, kind: 'money', from: 'commissions' },
        { label: 'Reimbursement', value: d.miles, kind: 'money', from: 'mileage' },
      ],
      check:
        `ADP pays ${d.regularHours} x $${money(d.rate)} + ${d.overtimeHours} x $${money(d.rate)} x 1.5 = $${money(adpGross)}; ` +
        `this run computes ${d.totalHours} x $${money(d.rate)} + ${d.overtimeHours} x $${money(d.rate / 2)} = $${money(basePay)}`,
      ok: ties(adpGross, basePay),
    };
  }

  if (d.classification === '1099') {
    // Contractors have no OT concept in ADP, so the premium is baked into comp hours.
    // Comp hours are algebraically identical to the run's base pay, EXCEPT that an
    // odd OT figure makes OT/2 land on a half-cent and round2 nudges it. The drift is
    // bounded at 0.005h x rate, so the tolerance is that bound rather than a flat
    // cent — otherwise ordinary rounding reads as a reconciliation break.
    const exactCompHours = d.totalHours + d.overtimeHours / 2;
    const compHours = round2(exactCompHours);
    const adpGross = round2(compHours * d.rate);
    const roundingDrift = round2((compHours - exactCompHours) * d.rate);
    const tolerance = 0.005 * d.rate + 0.01;
    return {
      table: 'ADP 1099',
      columns: [
        { label: 'Comp Hours', value: compHours, kind: 'hours', from: 'total hours + OT/2 (premium baked in)' },
        { label: 'Comp Amount', value: earnings, kind: 'money', from: 'tips + commissions + bonus' },
        { label: 'Reimbursement', value: d.miles, kind: 'money', from: 'mileage' },
      ],
      check:
        `${compHours} comp hours x $${money(d.rate)} = $${money(adpGross)}; ` +
        `this run computes ${d.totalHours} x $${money(d.rate)} + ${d.overtimeHours} x $${money(d.rate / 2)} = $${money(basePay)}` +
        (Math.abs(roundingDrift) >= 0.01
          ? `. Comp hours round ${round2(exactCompHours)} to ${compHours}, so ADP pays $${money(
              Math.abs(roundingDrift)
            )} ${roundingDrift > 0 ? 'more' : 'less'} — rounding only`
          : ''),
      ok: ties(adpGross, basePay, tolerance),
      roundingDrift,
    };
  }

  return {
    table: null,
    columns: [],
    check: 'No W-2 / 1099 classification, so this person appears in neither ADP table and will not be paid',
    ok: false,
  };
}

export async function getPayrollAudit(weekStart: string): Promise<PayrollAudit> {
  const weekEnd = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  const checkDate = format(addDays(new Date(`${weekStart}T12:00:00`), 11), 'yyyy-MM-dd');

  const [run, summary, provenanceRow, lateness, changeLog] = await Promise.all([
    getPayrollRun(weekStart),
    getWeekSummary(weekStart),
    queryOne<{ source_file: string | null; imported_at: string | null; n: number }>(
      `SELECT MAX(source_file) AS source_file, MAX(created_at)::text AS imported_at, COUNT(*)::int AS n
         FROM payroll_entries WHERE week_start = $1`,
      [weekStart]
    ),
    query<{ employee_id: string; late_minutes: number }>(
      `SELECT employee_id, COALESCE(SUM(late_minutes), 0)::int AS late_minutes
         FROM attendance WHERE date >= $1 AND date <= $2 GROUP BY employee_id`,
      [weekStart, weekEnd]
    ),
    query<{
      id: string;
      changed_at: string;
      employee_name: string | null;
      scope: string;
      field: string;
      old_value: string | null;
      new_value: string | null;
      changed_by_name: string | null;
    }>(
      `SELECT id, changed_at::text, employee_name, scope, field, old_value, new_value, changed_by_name
         FROM payroll_change_log WHERE week_start = $1 ORDER BY changed_at DESC`,
      [weekStart]
    ),
  ]);

  const lateBy = new Map(lateness.map((l) => [l.employee_id, Number(l.late_minutes)]));
  const sourceFile = provenanceRow?.source_file ?? null;

  const employees: EmployeeAudit[] = run.detail.map((d) => {
    const inputs = inputsFor(d, sourceFile, lateBy.get(d.employeeId) ?? 0);
    const adp = adpTieFor(d);
    const overriddenFields = inputs.filter((i) => i.overridden).map((i) => i.label);

    const flags: string[] = [];
    if (!d.classification) flags.push('No W-2 / 1099 classification — appears in neither ADP table');
    if (d.rate === 0) flags.push('$0 hourly rate');
    if (d.totalHours > 80) flags.push(`${d.totalHours} hours in one week (over 80)`);
    if (!adp.ok && d.classification) flags.push('ADP row does not reproduce the computed gross');
    if (d.ov.bonus != null && !ties(d.ov.bonus, d.computedBonus)) {
      flags.push(
        `Bonus overridden to $${money(d.bonus)} from the engine's $${money(d.computedBonus)} (variance $${money(
          round2(d.bonus - d.computedBonus)
        )})`
      );
    }

    return {
      employeeId: d.employeeId,
      name: d.name,
      classification: d.classification,
      inputs,
      hoursMath:
        `${d.billableHours} billable + ${d.warehouseHours} warehouse + ${d.marketingHours} marketing = ` +
        `${d.totalHours} total → ${d.regularHours} regular + ${d.overtimeHours} overtime ` +
        `(hours above ${OT_WEEKLY_THRESHOLD})`,
      payMath:
        `${d.totalHours} x $${money(d.rate)} (all hours at standard) + ${d.overtimeHours} x $${money(
          d.rate / 2
        )} (OT half-premium) + $${money(d.tips)} tips + $${money(d.commissions)} commissions + $${money(
          d.bonus
        )} bonus + $${money(d.miles)} mileage = $${money(d.totalCompensation)}`,
      totalHours: d.totalHours,
      regularHours: d.regularHours,
      overtimeHours: d.overtimeHours,
      rate: d.rate,
      totalCompensation: d.totalCompensation,
      adp,
      overriddenFields,
      flags,
    };
  });

  const sum = (pick: (d: PayrollDetailRow) => number) => round2(run.detail.reduce((t, d) => t + pick(d), 0));

  const totals = {
    billableHours: sum((d) => d.billableHours),
    warehouseHours: sum((d) => d.warehouseHours),
    marketingHours: sum((d) => d.marketingHours),
    totalHours: sum((d) => d.totalHours),
    regularHours: sum((d) => d.regularHours),
    overtimeHours: sum((d) => d.overtimeHours),
    tips: sum((d) => d.tips),
    commissions: sum((d) => d.commissions),
    bonus: sum((d) => d.bonus),
    mileage: sum((d) => d.miles),
    totalCompensation: sum((d) => d.totalCompensation),
    w2Count: run.detail.filter((d) => d.classification === 'W-2').length,
    count1099: run.detail.filter((d) => d.classification === '1099').length,
    unclassified: run.detail.filter((d) => !d.classification).length,
    overrideCount: employees.filter((e) => e.overriddenFields.length > 0).length,
  };

  const checks = buildChecks(run, employees, totals, summary.computedGross);

  return {
    weekStart,
    weekEnd,
    weekLabel: `${format(new Date(`${weekStart}T12:00:00`), 'MMM d')} - ${format(
      new Date(`${weekEnd}T12:00:00`),
      'MMM d, yyyy'
    )}`,
    checkDate,
    provenance: {
      sourceFile,
      importedAt: provenanceRow?.imported_at ?? null,
      employeeCount: Number(provenanceRow?.n ?? 0),
    },
    employees,
    checks,
    changeLog: changeLog.map((c) => ({
      id: c.id,
      changedAt: c.changed_at,
      employeeName: c.employee_name,
      scope: c.scope,
      field: c.field,
      oldValue: c.old_value,
      newValue: c.new_value,
      changedByName: c.changed_by_name,
    })),
    runFlags: run.audit,
    totals,
  };
}

/** The cross-foot checks an F&A reviewer would otherwise redo by hand. */
function buildChecks(
  run: Awaited<ReturnType<typeof getPayrollRun>>,
  employees: EmployeeAudit[],
  totals: PayrollAudit['totals'],
  computedGross: number
): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];

  // 1. Hours split adds back to total hours.
  const split = round2(totals.regularHours + totals.overtimeHours);
  checks.push({
    label: 'Regular + overtime hours = total hours',
    expected: totals.totalHours,
    actual: split,
    ok: ties(split, totals.totalHours),
    detail: 'Every hour is classified exactly once; nothing dropped or double-counted at the 40-hour split.',
  });

  // 2. Component hours add back to total hours.
  const components = round2(totals.billableHours + totals.warehouseHours + totals.marketingHours);
  checks.push({
    label: 'Billable + warehouse + marketing = total hours',
    expected: totals.totalHours,
    actual: components,
    ok: ties(components, totals.totalHours),
    detail: 'The three hour sources reconcile to the hours being paid.',
  });

  // 3. Everyone with payroll lands in exactly one ADP table.
  const placed = totals.w2Count + totals.count1099;
  checks.push({
    label: 'Every employee lands in an ADP table',
    expected: run.detail.length,
    actual: placed,
    ok: placed === run.detail.length,
    detail:
      totals.unclassified > 0
        ? `${totals.unclassified} unclassified — they will not be paid until W-2/1099 is set.`
        : 'No one falls between the two tables.',
  });

  // 4. ADP row counts match the classified population.
  checks.push({
    label: 'ADP W-2 row count matches W-2 employees',
    expected: totals.w2Count,
    actual: run.w2.length,
    ok: run.w2.length === totals.w2Count,
    detail: 'The W-2 table exports one row per W-2 employee.',
  });
  checks.push({
    label: 'ADP 1099 row count matches 1099 contractors',
    expected: totals.count1099,
    actual: run.contractors1099.length,
    ok: run.contractors1099.length === totals.count1099,
    detail: 'The 1099 table exports one row per contractor.',
  });

  // 5. Each ADP row reproduces the run's gross for that person.
  const mismatched = employees.filter((e) => e.classification && !e.adp.ok);
  checks.push({
    label: 'Every ADP row reproduces the computed gross',
    expected: `${employees.filter((e) => e.classification).length} rows tie`,
    actual: `${employees.filter((e) => e.classification).length - mismatched.length} tie`,
    ok: mismatched.length === 0,
    detail:
      mismatched.length > 0
        ? `Does not tie: ${mismatched.map((m) => m.name).join(', ')}`
        : 'W-2 rows re-priced at 1.5x OT, and 1099 comp-hours, both reproduce this run’s base pay.',
  });

  // 6. Earnings carried into ADP equal the earnings in the detail.
  const adpEarnings = round2(
    run.w2.reduce((t, r) => t + r.tips + r.bonus + r.commissions, 0) +
      run.contractors1099.reduce((t, r) => t + r.compAmount, 0)
  );
  const classifiedEarnings = round2(
    run.detail
      .filter((d) => d.classification)
      .reduce((t, d) => t + d.tips + d.commissions + d.bonus, 0)
  );
  checks.push({
    label: 'Tips + commissions + bonus carried into ADP',
    expected: classifiedEarnings,
    actual: adpEarnings,
    ok: ties(adpEarnings, classifiedEarnings),
    detail: 'No earnings are lost between the run and the two ADP tables.',
  });

  // 7. Mileage reimbursement carries across in full.
  const adpReimb = round2(
    run.w2.reduce((t, r) => t + r.reimbursement, 0) +
      run.contractors1099.reduce((t, r) => t + r.reimbursement, 0)
  );
  const classifiedReimb = round2(
    run.detail.filter((d) => d.classification).reduce((t, d) => t + d.miles, 0)
  );
  checks.push({
    label: 'Mileage reimbursement carried into ADP',
    expected: classifiedReimb,
    actual: adpReimb,
    ok: ties(adpReimb, classifiedReimb),
    detail: 'Reimbursements are non-taxable and must pass through untouched.',
  });

  // 8. Per-employee total comp adds to the week's total comp.
  const recomputed = round2(
    run.detail.reduce(
      (t, d) => t + round2(d.totalHours * d.rate + d.overtimeHours * (d.rate / 2) + d.tips + d.commissions + d.bonus + d.miles),
      0
    )
  );
  checks.push({
    label: 'Per-employee compensation adds to the week total',
    expected: totals.totalCompensation,
    actual: recomputed,
    ok: ties(recomputed, totals.totalCompensation, 0.05),
    detail: 'Recomputed independently from each row’s inputs, then cross-footed.',
  });

  // 9. Bridge the gross frozen at import to the run's live base pay. They are SUPPOSED
  //    to differ: marketing hours and manual corrections are layered on after import.
  //    An audit wants the bridge itemized, not a bare pass/fail on two unlike figures.
  const liveBase = round2(
    run.detail.reduce((t, d) => t + d.totalHours * d.rate + d.overtimeHours * (d.rate / 2), 0)
  );
  // Marketing hours don't only add straight time — they push people over 40 and
  // create OT premium that wasn't in the imported gross. Both legs are itemized so
  // the true cost of marketing time is visible rather than buried in a residual.
  let marketingStraight = 0;
  let marketingInducedOt = 0;
  for (const d of run.detail) {
    marketingStraight += d.marketingHours * d.rate;
    const otWithoutMarketing = Math.max(0, round2(d.billableHours + d.warehouseHours) - OT_WEEKLY_THRESHOLD);
    marketingInducedOt += Math.max(0, d.overtimeHours - otWithoutMarketing) * (d.rate / 2);
  }
  marketingStraight = round2(marketingStraight);
  marketingInducedOt = round2(marketingInducedOt);
  const bridged = round2(round2(computedGross) + marketingStraight + marketingInducedOt);
  const residual = round2(liveBase - bridged);
  checks.push({
    label: 'Import gross + marketing = live base pay',
    expected: bridged,
    actual: liveBase,
    ok: ties(residual, 0, 0.05),
    detail:
      `Gross frozen at import $${money(round2(computedGross))} + marketing straight time $${money(
        marketingStraight
      )} + overtime premium created by marketing hours $${money(marketingInducedOt)} = $${money(bridged)}. ` +
      (Math.abs(residual) <= 0.05
        ? 'Bridges to live base pay.'
        : `Unexplained residual of $${money(residual)} — a warehouse-hours or rate correction made since the import would explain it.`),
  });

  return checks;
}

// ── Audit pack (CSV) ──────────────────────────────────────────

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function row(...cells: (string | number)[]): string {
  return cells.map(esc).join(',');
}

/**
 * The whole audit as one CSV an F&A reviewer can drop into their working papers:
 * provenance, the reconciliation results, week totals, the per-employee derivation
 * with a source column per input, the ADP tie-out, exceptions, and the change log.
 */
export function renderPayrollAuditCsv(a: PayrollAudit): string {
  const out: string[] = [];

  out.push(row('GOODGUYS PAYROLL AUDIT PACK'));
  out.push(row('Pay period', a.weekLabel));
  out.push(row('Week start (Mon)', a.weekStart));
  out.push(row('Week end (Sun)', a.weekEnd));
  out.push(row('Check date', a.checkDate));
  out.push(row('Source file', a.provenance.sourceFile ?? '—'));
  out.push(row('Imported at', a.provenance.importedAt ?? '—'));
  out.push(row('Employees imported', a.provenance.employeeCount));
  out.push('');

  out.push(row('HOW PAY IS CALCULATED'));
  out.push(row('Total hours', 'Billable (job) hours + warehouse hours + marketing hours'));
  out.push(row('Warehouse hours', `${WAREHOUSE_HOURS_PER_DAY}h per job-day less that day's lateness, floored at 0`));
  out.push(row('Overtime', `Hours above ${OT_WEEKLY_THRESHOLD} in the week`));
  out.push(row('Compensation', 'total hours x rate + OT hours x (rate/2) + tips + commissions + bonus + mileage'));
  out.push(row('ADP W-2', 'Regular/overtime hours split; ADP applies the 1.5x itself'));
  out.push(row('ADP 1099', 'OT premium baked into comp hours (total + OT/2); comp hours x rate reproduces the same gross'));
  out.push('');

  out.push(row('RECONCILIATION'));
  out.push(row('Result', 'Check', 'Expected', 'Actual', 'Detail'));
  for (const c of a.checks) {
    out.push(row(c.ok ? 'PASS' : 'FAIL', c.label, c.expected, c.actual, c.detail));
  }
  out.push('');

  out.push(row('WEEK TOTALS'));
  out.push(row('Billable hours', a.totals.billableHours.toFixed(2)));
  out.push(row('Warehouse hours', a.totals.warehouseHours.toFixed(2)));
  out.push(row('Marketing hours', a.totals.marketingHours.toFixed(2)));
  out.push(row('Total hours', a.totals.totalHours.toFixed(2)));
  out.push(row('Regular hours', a.totals.regularHours.toFixed(2)));
  out.push(row('Overtime hours', a.totals.overtimeHours.toFixed(2)));
  out.push(row('Tips', money(a.totals.tips)));
  out.push(row('Commissions', money(a.totals.commissions)));
  out.push(row('Bonus', money(a.totals.bonus)));
  out.push(row('Mileage', money(a.totals.mileage)));
  out.push(row('Total compensation', money(a.totals.totalCompensation)));
  out.push(row('W-2 employees', a.totals.w2Count));
  out.push(row('1099 contractors', a.totals.count1099));
  out.push(row('Unclassified', a.totals.unclassified));
  out.push(row('Employees with a manual correction', a.totals.overrideCount));
  out.push('');

  out.push(row('PER-EMPLOYEE DERIVATION'));
  out.push(
    row(
      'Employee',
      'Classification',
      'Billable Hrs',
      'Warehouse Hrs',
      'Marketing Hrs',
      'Total Hrs',
      'Regular Hrs',
      'OT Hrs',
      'Rate',
      'Tips',
      'Commissions',
      'Bonus',
      'Mileage',
      'Total Comp',
      'Corrected Fields',
      'Hours Math',
      'Compensation Math',
      'ADP Table',
      'ADP Tie-Out',
      'Ties?'
    )
  );
  const pick = (e: EmployeeAudit, label: string) => e.inputs.find((i) => i.label === label)?.value ?? 0;
  for (const e of a.employees) {
    out.push(
      row(
        e.name,
        e.classification ?? 'UNCLASSIFIED',
        pick(e, 'Billable (job) hours').toFixed(2),
        pick(e, 'Warehouse hours').toFixed(2),
        pick(e, 'Marketing hours').toFixed(2),
        e.totalHours.toFixed(2),
        e.regularHours.toFixed(2),
        e.overtimeHours.toFixed(2),
        money(e.rate),
        money(pick(e, 'Tips')),
        money(pick(e, 'Commissions')),
        money(pick(e, 'Weekly bonus')),
        money(pick(e, 'Mileage reimbursement')),
        money(e.totalCompensation),
        e.overriddenFields.join('; '),
        e.hoursMath,
        e.payMath,
        e.adp.table ?? 'none',
        e.adp.check,
        e.adp.ok ? 'yes' : 'NO'
      )
    );
  }
  out.push(
    row(
      'TOTAL',
      '',
      a.totals.billableHours.toFixed(2),
      a.totals.warehouseHours.toFixed(2),
      a.totals.marketingHours.toFixed(2),
      a.totals.totalHours.toFixed(2),
      a.totals.regularHours.toFixed(2),
      a.totals.overtimeHours.toFixed(2),
      '',
      money(a.totals.tips),
      money(a.totals.commissions),
      money(a.totals.bonus),
      money(a.totals.mileage),
      money(a.totals.totalCompensation),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  out.push('');

  out.push(row('INPUT SOURCES - where each number originates'));
  out.push(row('Employee', 'Input', 'Value', 'Source', 'Derivation', 'Overridden', 'System Value'));
  for (const e of a.employees) {
    for (const i of e.inputs) {
      out.push(
        row(
          e.name,
          i.label,
          i.kind === 'hours' ? i.value.toFixed(2) : money(i.value),
          i.source,
          i.derivation ?? '',
          i.overridden ? 'YES' : '',
          i.systemValue == null ? '' : money(i.systemValue)
        )
      );
    }
  }
  out.push('');

  out.push(row('EXCEPTIONS'));
  out.push(row('Employee', 'Exception'));
  const flagged = a.employees.filter((e) => e.flags.length > 0);
  if (flagged.length === 0) out.push(row('(none)'));
  for (const e of flagged) {
    for (const f of e.flags) out.push(row(e.name, f));
  }
  out.push('');

  out.push(row('MANUAL CHANGE LOG'));
  out.push(row('When', 'Who', 'Employee', 'Scope', 'Field', 'From', 'To'));
  if (a.changeLog.length === 0) {
    out.push(row('(no manual changes recorded for this week)'));
  }
  for (const c of a.changeLog) {
    out.push(
      row(
        format(new Date(c.changedAt), 'yyyy-MM-dd HH:mm'),
        c.changedByName ?? '',
        c.employeeName ?? 'week-level',
        c.scope,
        c.field,
        c.oldValue ?? '',
        c.newValue ?? 'cleared'
      )
    );
  }

  return out.join('\n');
}
