/**
 * Rental reminder emails.
 *
 * One digest a day, and only when there is something to act on — an inbox that
 * gets a daily "nothing to do" learns to ignore the sender, which is exactly
 * when the one that matters arrives.
 *
 * Three things it chases:
 *   book   — 5, then 3, then 1 BUSINESS days before a truck is needed, while it
 *            still shows as not booked. Escalating rather than repeating: each
 *            milestone fires once.
 *   pickup — the day before we are due to collect one.
 *   return — the day before it is due back, then daily once overdue, because
 *            that is the one that bills every day it slips.
 *
 * Sends are recorded in rental_reminders_sent AFTER a successful send, so a
 * Resend outage retries tomorrow rather than silently swallowing the warning.
 */

import { query, queryOne } from '@/lib/db';
import { sendEmail, escHtml } from '@/lib/email';
import { getStringSetting } from '@/lib/settings';
import { CONFIG } from '@/types';
import { getOwnedTruckCapacity } from '@/lib/truck-capacity';
import { getDemandDays, getActiveRentals, getLeadTimeDays } from '@/lib/rentals';
import { buildWindows, subtractBusinessDays } from '@/lib/rentals-windows';

export type Milestone = '5bd' | '3bd' | '1bd' | 'day_before' | 'overdue';

export interface ReminderLine {
  kind: 'book' | 'pickup' | 'return';
  milestone: Milestone;
  /** A logged rental, when there is one. */
  rentalId: string | null;
  /** The window's first short day, when there is no rental yet. */
  windowKey: string | null;
  what: string;
  when: string;
  detail: string;
}

const FALLBACK_TO = 'trent@goodguysserve.com';

async function recipients(): Promise<string[]> {
  const raw = (await getStringSetting('rental_reminder_emails')) ?? FALLBACK_TO;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Today in America/New_York. Every date boundary in this app is ET, not UTC. */
async function todayET(): Promise<string> {
  const row = await queryOne<{ d: string }>(
    "SELECT (NOW() AT TIME ZONE 'America/New_York')::date::text AS d"
  );
  return row!.d;
}

/**
 * The most urgent booking milestone that is already due for something needed on
 * `neededFrom`, or null if it is still too early to nag.
 *
 * Uses >= rather than == on purpose: if the cron misses a day, the milestone is
 * still owed and goes out late rather than never.
 */
function bookingMilestone(today: string, neededFrom: string, leadDays: number): Milestone | null {
  if (today >= neededFrom) return '1bd'; // needed today or already past — loudest
  if (today >= subtractBusinessDays(neededFrom, 1)) return '1bd';
  if (today >= subtractBusinessDays(neededFrom, 3)) return '3bd';
  if (today >= subtractBusinessDays(neededFrom, leadDays)) return '5bd';
  return null;
}

/** What has already gone out, as a set of "kind|subject|milestone" keys. */
async function alreadySent(today: string): Promise<Set<string>> {
  const rows = await query<{ k: string }>(
    `SELECT kind || '|' || COALESCE(rental_id::text, window_key) || '|' || milestone
              || CASE WHEN milestone = 'overdue' THEN '|' || sent_on::text ELSE '' END AS k
       FROM rental_reminders_sent
      WHERE milestone <> 'overdue' OR sent_on = $1::date`,
    [today]
  );
  return new Set(rows.map((r) => r.k));
}

function keyFor(line: ReminderLine, today: string): string {
  const subject = line.rentalId ?? line.windowKey;
  const suffix = line.milestone === 'overdue' ? `|${today}` : '';
  return `${line.kind}|${subject}|${line.milestone}${suffix}`;
}

/** Everything worth an email today, before de-duplication. */
export async function collectReminders(today: string): Promise<ReminderLine[]> {
  const [capacity, leadDays, active] = await Promise.all([
    getOwnedTruckCapacity(),
    getLeadTimeDays(),
    getActiveRentals(),
  ]);
  const days = await getDemandDays(today, CONFIG.RENTAL_HORIZON_DAYS);

  const lines: ReminderLine[] = [];

  // ── Book: uncovered demand windows ──────────────────────────────────────
  const coverage = active
    .filter((r) => r.status === 'booked' || r.status === 'picked_up')
    .map((r) => ({ needed_from: r.needed_from, est_return_date: r.est_return_date }));

  const windows = buildWindows({
    days,
    capacity,
    coverage,
    today,
    horizonDays: CONFIG.RENTAL_HORIZON_DAYS,
    leadTimeDays: leadDays,
    bridgeDays: CONFIG.RENTAL_BRIDGE_DAYS,
  });

  for (const w of windows) {
    if (w.trucks_uncovered <= 0) continue;
    const milestone = bookingMilestone(today, w.needed_from, leadDays);
    if (!milestone) continue;
    lines.push({
      kind: 'book',
      milestone,
      rentalId: null,
      windowKey: w.needed_from,
      what: `${w.trucks_uncovered} truck${w.trucks_uncovered === 1 ? '' : 's'} not booked`,
      when: w.needed_from,
      detail: `Needed ${w.needed_from}${w.last_needed !== w.needed_from ? ` – ${w.last_needed}` : ''} · book by ${w.book_by} · back on ${w.suggested_return}`,
    });
  }

  // ── Book: rentals we decided on but never reserved ──────────────────────
  for (const r of active.filter((r) => r.status === 'planned')) {
    const milestone = bookingMilestone(today, r.needed_from, leadDays);
    if (!milestone) continue;
    lines.push({
      kind: 'book',
      milestone,
      rentalId: r.id,
      windowKey: null,
      what: `${r.vendor}${r.size ? ` ${r.size}` : ''} still not booked`,
      when: r.needed_from,
      detail: `Needed ${r.needed_from} · logged but never reserved`,
    });
  }

  // ── Pick up: due to be collected tomorrow ───────────────────────────────
  for (const r of active.filter((r) => r.status === 'booked')) {
    if (subtractBusinessDays(r.needed_from, 1) !== today && r.needed_from !== today) continue;
    lines.push({
      kind: 'pickup',
      milestone: 'day_before',
      rentalId: r.id,
      windowKey: null,
      what: `Collect ${r.vendor}${r.size ? ` ${r.size}` : ''}`,
      when: r.needed_from,
      detail: `Pick up ${r.needed_from}${r.pickup_time ? ` at ${r.pickup_time}` : ''}${r.vendor_ref ? ` · #${r.vendor_ref}` : ''}`,
    });
  }

  // ── Return: due back tomorrow, or already overdue ───────────────────────
  for (const r of active.filter((r) => r.status === 'picked_up')) {
    if (r.est_return_date < today) {
      lines.push({
        kind: 'return',
        milestone: 'overdue',
        rentalId: r.id,
        windowKey: null,
        what: `OVERDUE: ${r.truck_name ?? r.vendor} still out`,
        when: r.est_return_date,
        detail: `Was due back ${r.est_return_date} — billing every day it stays out`,
      });
    } else if (subtractBusinessDays(r.est_return_date, 1) === today || r.est_return_date === today) {
      lines.push({
        kind: 'return',
        milestone: 'day_before',
        rentalId: r.id,
        windowKey: null,
        what: `Return ${r.truck_name ?? r.vendor}`,
        when: r.est_return_date,
        detail: `Due back ${r.est_return_date} — offload it before it goes`,
      });
    }
  }

  return lines;
}

function buildHtml(lines: ReminderLine[], today: string): string {
  const section = (title: string, kind: ReminderLine['kind']) => {
    const rows = lines.filter((l) => l.kind === kind);
    if (rows.length === 0) return '';
    return `
      <h3 style="margin:18px 0 6px;font:600 15px system-ui,sans-serif">${escHtml(title)}</h3>
      <table style="border-collapse:collapse;width:100%;font:14px system-ui,sans-serif">
        ${rows
          .map(
            (l) => `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escHtml(l.what)}</strong><br>
                <span style="color:#666">${escHtml(l.detail)}</span></td>
            </tr>`
          )
          .join('')}
      </table>`;
  };

  return `
    <div style="font:14px system-ui,sans-serif;color:#111">
      <h2 style="margin:0 0 4px;font:700 18px system-ui,sans-serif">Rental trucks — ${escHtml(today)}</h2>
      <p style="margin:0;color:#666">Only what needs doing. Nothing to act on means no email.</p>
      ${section('Needs booking', 'book')}
      ${section('Pick up', 'pickup')}
      ${section('Return', 'return')}
      <p style="margin:18px 0 0">
        <a href="https://goodguys-dashboard.vercel.app/admin/rentals">Open the rental board</a>
      </p>
    </div>`;
}

export interface ReminderResult {
  ok: boolean;
  today: string;
  considered: number;
  sent: boolean;
  lines: ReminderLine[];
  error?: string;
}

/**
 * Build and send today's digest.
 *
 * `dryRun` composes everything and reports what WOULD go out without sending or
 * recording it — the only safe way to check this against live data.
 */
export async function sendRentalReminders(opts?: {
  todayOverride?: string;
  dryRun?: boolean;
}): Promise<ReminderResult> {
  const today = opts?.todayOverride ?? (await todayET());

  const all = await collectReminders(today);
  const sentAlready = await alreadySent(today);
  const lines = all.filter((l) => !sentAlready.has(keyFor(l, today)));

  if (lines.length === 0) {
    return { ok: true, today, considered: all.length, sent: false, lines: [] };
  }
  if (opts?.dryRun) {
    return { ok: true, today, considered: all.length, sent: false, lines };
  }

  const to = await recipients();
  if (to.length === 0) {
    return { ok: false, today, considered: all.length, sent: false, lines, error: 'No recipients' };
  }

  const urgent = lines.some((l) => l.milestone === 'overdue' || l.milestone === '1bd');
  const result = await sendEmail({
    to,
    subject: `${urgent ? 'Action needed' : 'Rental trucks'} — ${lines.length} item${lines.length === 1 ? '' : 's'}`,
    html: buildHtml(lines, today),
  });
  if (!result.ok) {
    // Deliberately not recorded: an unsent reminder must go out again tomorrow.
    return { ok: false, today, considered: all.length, sent: false, lines, error: result.error };
  }

  for (const l of lines) {
    await query(
      `INSERT INTO rental_reminders_sent (kind, rental_id, window_key, milestone, sent_on)
       VALUES ($1, $2, $3, $4, $5::date)
       ON CONFLICT DO NOTHING`,
      [l.kind, l.rentalId, l.windowKey, l.milestone, today]
    );
  }

  return { ok: true, today, considered: all.length, sent: true, lines };
}
