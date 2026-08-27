import { query } from '@/lib/db';
import { addDays, format } from 'date-fns';
import {
  getBonusConfig,
  getWeekAdjustments,
  getWeekResults,
  getWeekStatus,
  roleAutoBonusDetailMap,
  computeWeek,
  positiveLabel,
  strikeLabel,
  type AdjustmentRow,
  type BonusConfig,
  type PositiveRow,
  type RoleBonus,
  type StrikeRow,
  type WeekEvents,
  type WriteUpRow,
} from '@/lib/bonus';

/**
 * The weekly bonus REPORT — one week, fully itemized and self-explaining.
 *
 * The old export was a flat five-column CSV: name, hours, multiplier, dollars. It
 * answered "what" and nothing else, so payroll couldn't check a figure and nobody
 * could tell a crew member why their number was what it was. This builds the whole
 * picture instead: every input to the multiplier, the arithmetic spelled out in
 * plain English, the events that drove it, post-lock adjustments folded into a
 * final Total Paid, and totals that reconcile.
 *
 * Frozen figures always win. Hours, multiplier, and bonus come from the snapshot
 * taken at lock; the breakdown comes from the snapshot too for weeks locked after
 * the breakdown columns landed, and is reconstructed from live events (and clearly
 * labelled) for older weeks.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Money without a currency symbol, so it lands in a spreadsheet as a number. */
function money(n: number): string {
  return n.toFixed(2);
}

/** Multipliers read as 0.5×, 1.75× — trailing zeros trimmed past 2dp. */
function mult(n: number): string {
  return String(round2(n));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export interface ReportEvent {
  date: string;
  category: 'GG Point' | 'Discretionary GG Point' | 'Strike' | 'Strike (voided)' | 'Write-Up';
  detail: string;
  impact: string;
  note: string;
}

export interface ReportLine {
  employeeId: string;
  name: string;
  hours: number;
  hasHours: boolean;
  baseRate: number;
  baseMultiplier: number;
  ggPoints: number;
  ggPointsValue: number;
  roleAddOns: number;
  roleAddOnDetail: RoleBonus[];
  discretionaryPoints: number;
  discretionaryValue: number;
  grossMultiplier: number;
  strikeCount: number;
  appliedMultiplier: number;
  forfeitedMultiplier: number;
  forfeitedDollars: number;
  bonus: number;
  adjustments: number;
  totalPaid: number;
  status: string;
  multiplierMath: string;
  bonusMath: string;
  events: ReportEvent[];
  /** Breakdown rebuilt from live events because the week predates the frozen inputs. */
  reconstructed: boolean;
  /** Set when a reconstructed breakdown disagrees with the frozen multiplier. */
  discrepancy: string | null;
}

export interface WeekBonusReport {
  weekStart: string;
  weekEnding: string;
  weekLabel: string;
  approvedByName: string | null;
  approvedAt: string | null;
  config: BonusConfig;
  lines: ReportLine[];
  adjustments: AdjustmentRow[];
  totals: {
    employees: number;
    paidEmployees: number;
    hours: number;
    bonus: number;
    adjustments: number;
    payout: number;
    forfeited: number;
    ggPoints: number;
    strikes: number;
  };
  anyReconstructed: boolean;
}

type WithEmployee<T> = T & { employee_id: string };

/** Every bonus-affecting event logged against the week, grouped per employee. */
async function weekEventsByEmployee(
  weekStart: string
): Promise<Map<string, WeekEvents>> {
  const [positives, strikes, writeUps] = await Promise.all([
    query<WithEmployee<PositiveRow>>(
      `SELECT id, employee_id, type, event_date::text, note, job_id, discretionary
         FROM bonus_positives WHERE week_start = $1 ORDER BY event_date`,
      [weekStart]
    ),
    query<WithEmployee<StrikeRow>>(
      `SELECT id, employee_id, type, event_date::text, voided, void_reason, note, truck_id
         FROM bonus_strikes WHERE week_start = $1 ORDER BY event_date`,
      [weekStart]
    ),
    query<WithEmployee<WriteUpRow>>(
      `SELECT id, employee_id, event_date::text, summary
         FROM write_ups WHERE week_start = $1 ORDER BY event_date`,
      [weekStart]
    ),
  ]);

  const map = new Map<string, WeekEvents>();
  const bucket = (id: string): WeekEvents => {
    const existing = map.get(id);
    if (existing) return existing;
    const fresh: WeekEvents = { positives: [], strikes: [], writeUps: [] };
    map.set(id, fresh);
    return fresh;
  };
  for (const p of positives) bucket(p.employee_id).positives.push(p);
  for (const s of strikes) bucket(s.employee_id).strikes.push(s);
  for (const w of writeUps) bucket(w.employee_id).writeUps.push(w);
  return map;
}

/** The audit trail behind one person's multiplier, oldest first. */
function toReportEvents(events: WeekEvents, config: BonusConfig): ReportEvent[] {
  const rows: ReportEvent[] = [
    ...events.positives.map((p): ReportEvent => ({
      date: p.event_date,
      category: p.discretionary ? 'Discretionary GG Point' : 'GG Point',
      detail: positiveLabel(p.type),
      impact: p.discretionary
        ? `+${config.increment}x multiplier (strike-proof)`
        : `+${config.increment}x multiplier`,
      note: p.note ?? '',
    })),
    ...events.strikes.map((s): ReportEvent => ({
      date: s.event_date,
      category: s.voided ? 'Strike (voided)' : 'Strike',
      detail: strikeLabel(s.type),
      impact: s.voided ? 'Voided - no effect on bonus' : 'Forfeits the normal bonus',
      note: s.voided && s.void_reason ? `Voided: ${s.void_reason}` : s.note ?? '',
    })),
    ...events.writeUps.map((w): ReportEvent => ({
      date: w.event_date,
      category: 'Write-Up',
      detail: 'Write-Up',
      impact: 'No direct bonus effect',
      note: w.summary,
    })),
  ];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
}

/** "0.50 base + 2 GG Points x 0.50 (1.00) + Driver 0.25 = 1.75x, all retained" */
function describeMultiplier(line: Omit<ReportLine, 'multiplierMath' | 'bonusMath' | 'status'>, config: BonusConfig): string {
  const parts = [`${mult(line.baseMultiplier)} base`];
  if (line.ggPoints > 0) {
    parts.push(
      `${plural(line.ggPoints, 'GG Point')} x ${mult(config.increment)} (${mult(line.ggPointsValue)})`
    );
  }
  for (const role of line.roleAddOnDetail) {
    parts.push(`${role.label} ${mult(role.amount)}`);
  }
  if (line.discretionaryPoints > 0) {
    parts.push(
      `${plural(line.discretionaryPoints, 'discretionary GG Point')} x ${mult(config.increment)} (${mult(line.discretionaryValue)})`
    );
  }
  const built = `${parts.join(' + ')} = ${mult(line.grossMultiplier)}x earned`;

  if (line.strikeCount === 0) return `${built}; no strikes, so all ${mult(line.appliedMultiplier)}x applied`;
  if (line.strikeCount >= config.forfeitThreshold) {
    return `${built}; ${plural(line.strikeCount, 'strike')} hit the ${config.forfeitThreshold}-strike forfeit threshold, so the entire bonus is forfeited - 0x applied`;
  }
  const normal = round2(line.grossMultiplier - line.discretionaryValue);
  const retained =
    line.discretionaryValue > 0
      ? `${mult(line.discretionaryValue)}x of discretionary GG Points is strike-proof and retained`
      : 'nothing was discretionary, so nothing is retained';
  return `${built}; ${plural(line.strikeCount, 'strike')} forfeits the normal bonus (${mult(normal)}x) and ${retained} - ${mult(line.appliedMultiplier)}x applied`;
}

export async function getWeekBonusReport(weekStart: string): Promise<WeekBonusReport> {
  const config = await getBonusConfig();
  const [status, snapshot, adjustments, events, roleDetail, baseOverrides] = await Promise.all([
    getWeekStatus(weekStart),
    getWeekResults(weekStart),
    getWeekAdjustments(weekStart),
    weekEventsByEmployee(weekStart),
    roleAutoBonusDetailMap(config),
    query<{ id: string; base_multiplier: number | null }>(
      'SELECT id, base_multiplier FROM employees'
    ),
  ]);

  const baseById = new Map(
    baseOverrides.map((e) => [e.id, e.base_multiplier == null ? null : Number(e.base_multiplier)])
  );

  // Adjustments roll up per person and land in Total Paid, so the report's bottom
  // line is what actually gets paid rather than a pre-correction figure.
  const adjByEmployee = new Map<string, number>();
  for (const a of adjustments) {
    adjByEmployee.set(a.employeeId, round2((adjByEmployee.get(a.employeeId) ?? 0) + a.delta));
  }

  const lines: ReportLine[] = snapshot.map((snap) => {
    const empEvents = events.get(snap.employeeId) ?? { positives: [], strikes: [], writeUps: [] };
    const roles = roleDetail.get(snap.employeeId) ?? [];
    const reconstructed = snap.baseRate == null;

    // Older weeks froze only the answer. Rebuild the inputs from the week's events
    // (which are read-only once a week is locked) and flag the row as rebuilt.
    const rebuilt = reconstructed
      ? computeWeek(empEvents, snap.hours, config, {
          autoBonus: roles.reduce((sum, r) => sum + r.amount, 0),
          baseMultiplier: baseById.get(snap.employeeId) ?? undefined,
        })
      : null;

    const baseRate = snap.baseRate ?? config.baseRate;
    const baseMultiplier = snap.baseMultiplier ?? rebuilt?.baseMultiplier ?? config.baseMultiplier;
    const ggPoints = snap.positivesCount;
    const discretionaryPoints = snap.discretionaryCount ?? rebuilt?.discretionaryCount ?? 0;
    const roleAddOns = snap.autoBonus ?? rebuilt?.autoBonus ?? 0;
    const strikeCount =
      snap.strikeCount ?? rebuilt?.strikeCount ?? empEvents.strikes.filter((s) => !s.voided).length;
    const grossMultiplier = snap.grossMultiplier ?? rebuilt?.grossMultiplier ?? snap.multiplier;

    const ggPointsValue = round2(config.increment * ggPoints);
    const discretionaryValue = round2(config.increment * discretionaryPoints);
    const forfeitedMultiplier = round2(Math.max(0, grossMultiplier - snap.multiplier));

    const draft = {
      employeeId: snap.employeeId,
      name: snap.name,
      hours: snap.hours,
      hasHours: snap.hours > 0,
      baseRate,
      baseMultiplier,
      ggPoints,
      ggPointsValue,
      roleAddOns,
      roleAddOnDetail: roles,
      discretionaryPoints,
      discretionaryValue,
      grossMultiplier,
      strikeCount,
      appliedMultiplier: snap.multiplier,
      forfeitedMultiplier,
      forfeitedDollars: round2(snap.hours * baseRate * forfeitedMultiplier),
      bonus: snap.bonus,
      adjustments: adjByEmployee.get(snap.employeeId) ?? 0,
      totalPaid: round2(snap.bonus + (adjByEmployee.get(snap.employeeId) ?? 0)),
      events: toReportEvents(empEvents, config),
      reconstructed,
      discrepancy:
        rebuilt && Math.abs(rebuilt.multiplier - snap.multiplier) > 0.001
          ? `Rebuilt breakdown gives ${mult(rebuilt.multiplier)}x but the week was locked at ${mult(snap.multiplier)}x - the locked figure is what was paid`
          : null,
    };

    const statusLabel = !draft.hasHours
      ? 'No payroll hours for the week'
      : strikeCount >= config.forfeitThreshold
        ? `Forfeited - ${plural(strikeCount, 'strike')}`
        : strikeCount > 0
          ? `Reduced - ${plural(strikeCount, 'strike')}`
          : 'Full bonus';

    return {
      ...draft,
      status: statusLabel,
      multiplierMath: describeMultiplier(draft, config),
      bonusMath: `${draft.hours.toFixed(2)} bonus hrs x $${money(baseRate)} x ${mult(snap.multiplier)} = $${money(snap.bonus)}`,
    };
  });

  // An adjustment can name someone with no snapshot row (added after they dropped
  // off the week). Give them a line so the totals still reconcile with the payout.
  const known = new Set(lines.map((l) => l.employeeId));
  for (const a of adjustments) {
    if (known.has(a.employeeId)) continue;
    known.add(a.employeeId);
    const delta = adjByEmployee.get(a.employeeId) ?? 0;
    lines.push({
      employeeId: a.employeeId,
      name: a.name,
      hours: 0,
      hasHours: false,
      baseRate: config.baseRate,
      baseMultiplier: 0,
      ggPoints: 0,
      ggPointsValue: 0,
      roleAddOns: 0,
      roleAddOnDetail: [],
      discretionaryPoints: 0,
      discretionaryValue: 0,
      grossMultiplier: 0,
      strikeCount: 0,
      appliedMultiplier: 0,
      forfeitedMultiplier: 0,
      forfeitedDollars: 0,
      bonus: 0,
      adjustments: delta,
      totalPaid: delta,
      status: 'Adjustment only - not in the locked week',
      multiplierMath: '',
      bonusMath: '',
      events: [],
      reconstructed: false,
      discrepancy: null,
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));

  const sum = (pick: (l: ReportLine) => number) => round2(lines.reduce((t, l) => t + pick(l), 0));
  const weekEnding = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');

  return {
    weekStart,
    weekEnding,
    weekLabel: `${format(new Date(`${weekStart}T12:00:00`), 'MMM d')} - ${format(
      new Date(`${weekEnding}T12:00:00`),
      'MMM d, yyyy'
    )}`,
    approvedByName: status.approvedByName,
    approvedAt: status.approvedAt,
    config,
    lines,
    adjustments,
    totals: {
      employees: lines.length,
      paidEmployees: lines.filter((l) => l.totalPaid > 0).length,
      hours: sum((l) => l.hours),
      bonus: sum((l) => l.bonus),
      adjustments: sum((l) => l.adjustments),
      payout: sum((l) => l.totalPaid),
      forfeited: sum((l) => l.forfeitedDollars),
      ggPoints: lines.reduce((t, l) => t + l.ggPoints + l.discretionaryPoints, 0),
      strikes: lines.reduce((t, l) => t + l.strikeCount, 0),
    },
    anyReconstructed: lines.some((l) => l.reconstructed),
  };
}

// ── CSV rendering ─────────────────────────────────────────────

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: (string | number)[]): string {
  return cells.map(esc).join(',');
}

/**
 * The report as a single CSV: a header block naming the week and the rules, a
 * summary that reconciles to the payout, a per-employee table where every column
 * is an input you can re-add yourself, then the event trail and the adjustment
 * log. Sectioned rather than one flat table because this is read by a human in a
 * spreadsheet, and a payroll clerk checking one person's number needs the whole
 * story on that person's row.
 */
export function renderWeekBonusCsv(report: WeekBonusReport): string {
  const { config, totals } = report;
  const lines: string[] = [];

  lines.push(row('GOODGUYS WEEKLY BONUS REPORT'));
  lines.push(row('Week', report.weekLabel));
  lines.push(row('Week start (Mon)', report.weekStart));
  lines.push(row('Week ending (Sun)', report.weekEnding));
  lines.push(row('Status', 'Approved / locked'));
  lines.push(row('Locked by', report.approvedByName ?? 'unknown'));
  lines.push(
    row('Locked at', report.approvedAt ? format(new Date(report.approvedAt), 'yyyy-MM-dd h:mm a') : '')
  );
  lines.push('');

  lines.push(row('HOW THE BONUS IS CALCULATED'));
  lines.push(row('Formula', 'Bonus = Bonus Hours x Base Rate x Multiplier'));
  lines.push(row('Bonus hours', 'Billable + warehouse hours from the weekly payroll import (excludes marketing/office time)'));
  lines.push(row('Base rate', `$${money(config.baseRate)} per hour, per 1.0x of multiplier`));
  lines.push(row('Base multiplier', `${mult(config.baseMultiplier)}x company default (an employee can carry their own base)`));
  lines.push(row('GG Point', `+${mult(config.increment)}x each, and they stack`));
  lines.push(row('Role add-ons', `Driver +${mult(config.driverWeekly)}x, 2-Truck Job Lead +${mult(config.truckLeadWeekly)}x, automatic from certifications`));
  lines.push(row('1 or 2 strikes', 'Forfeits the normal bonus (base + GG Points + role add-ons); discretionary GG Points are strike-proof and retained'));
  lines.push(row(`${config.forfeitThreshold}+ strikes`, 'Forfeits everything, including discretionary GG Points'));
  lines.push(row('Voided strikes', 'Do not count'));
  lines.push('');

  lines.push(row('SUMMARY'));
  lines.push(row('People on the report', totals.employees));
  lines.push(row('People receiving a payout', totals.paidEmployees));
  lines.push(row('Total bonus hours', totals.hours.toFixed(2)));
  lines.push(row('Total GG Points awarded', totals.ggPoints));
  lines.push(row('Total strikes', totals.strikes));
  lines.push(row('Bonus earned', money(totals.bonus)));
  lines.push(row('Post-lock adjustments', money(totals.adjustments)));
  lines.push(row('TOTAL PAYOUT', money(totals.payout)));
  lines.push(row('Forfeited to strikes (not paid)', money(totals.forfeited)));
  if (report.anyReconstructed) {
    lines.push('');
    lines.push(
      row(
        'NOTE',
        'Rows marked "rebuilt" were locked before the breakdown was recorded. Their hours, multiplier, and bonus are the frozen figures that were paid; the breakdown columns are reconstructed from the week’s events.'
      )
    );
  }
  lines.push('');

  lines.push(row('PER-EMPLOYEE DETAIL'));
  lines.push(
    row(
      'Employee',
      'Week Ending',
      'Status',
      'Bonus Hours',
      'Base Rate',
      'Base Multiplier',
      'GG Points',
      'GG Points Value',
      'Role Add-Ons',
      'Role Add-On Detail',
      'Discretionary GG Points',
      'Discretionary Value',
      'Multiplier Earned',
      'Strikes',
      'Multiplier Applied',
      'Bonus',
      'Adjustments',
      'Total Paid',
      'Forfeited $',
      'How the multiplier was built',
      'How the bonus was calculated',
      'Source'
    )
  );
  for (const l of report.lines) {
    lines.push(
      row(
        l.name,
        report.weekEnding,
        l.status,
        l.hours.toFixed(2),
        money(l.baseRate),
        mult(l.baseMultiplier),
        l.ggPoints,
        mult(l.ggPointsValue),
        mult(l.roleAddOns),
        l.roleAddOnDetail.map((r) => `${r.label} +${mult(r.amount)}`).join('; '),
        l.discretionaryPoints,
        mult(l.discretionaryValue),
        mult(l.grossMultiplier),
        l.strikeCount,
        mult(l.appliedMultiplier),
        money(l.bonus),
        money(l.adjustments),
        money(l.totalPaid),
        money(l.forfeitedDollars),
        l.multiplierMath,
        l.bonusMath,
        l.discrepancy ?? (l.reconstructed ? 'rebuilt' : 'locked snapshot')
      )
    );
  }
  lines.push(
    row(
      'TOTAL',
      report.weekEnding,
      '',
      totals.hours.toFixed(2),
      '',
      '',
      totals.ggPoints,
      '',
      '',
      '',
      '',
      '',
      '',
      totals.strikes,
      '',
      money(totals.bonus),
      money(totals.adjustments),
      money(totals.payout),
      money(totals.forfeited),
      '',
      '',
      ''
    )
  );
  lines.push('');

  lines.push(row('EVENT DETAIL - what drove each multiplier'));
  lines.push(row('Employee', 'Date', 'Category', 'Detail', 'Bonus Impact', 'Note'));
  const withEvents = report.lines.filter((l) => l.events.length > 0);
  if (withEvents.length === 0) {
    lines.push(row('(no positives, strikes, or write-ups logged this week)'));
  }
  for (const l of withEvents) {
    for (const e of l.events) {
      lines.push(row(l.name, e.date, e.category, e.detail, e.impact, e.note));
    }
  }
  lines.push('');

  lines.push(row('POST-LOCK ADJUSTMENTS'));
  lines.push(row('Employee', 'Logged', 'Amount', 'Reason'));
  if (report.adjustments.length === 0) {
    lines.push(row('(none)'));
  }
  for (const a of report.adjustments) {
    lines.push(
      row(a.name, format(new Date(a.createdAt), 'yyyy-MM-dd h:mm a'), money(a.delta), a.reason)
    );
  }

  return lines.join('\n');
}
