/**
 * Rental windows — the math behind "when do we book" and "when does it go back".
 *
 * Pure functions, no database and no React, because this is the part of the
 * module that can be quietly wrong. A bug here does not throw; it just stops
 * telling you to rent a truck, and you find out on the morning of the move.
 *
 * The shape of the problem: booked jobs need N trucks on a given day, we own C,
 * and any day where N > C is a day we are short. Consecutive short days are one
 * rental, not several — and that run is what yields a pickup date, a return date
 * and a book-by date.
 */

/** Demand for one day, already rounded up to whole trucks. */
export interface DemandDay {
  date: string; // yyyy-MM-dd
  demand: number;
}

/** What an existing rental covers, inclusive of both ends. */
export interface RentalCoverage {
  needed_from: string;
  est_return_date: string;
}

export type WindowState = 'covered' | 'planned' | 'book_now' | 'late';

export interface WindowDay {
  date: string;
  demand: number;
  shortfall: number;
  covered: number;
}

export interface RentalWindow {
  /** First day we are short — the day a rental has to be in the yard. */
  needed_from: string;
  /** Last day we are short. */
  last_needed: string;
  /** The morning after the last short day. This is the "when does it go back". */
  suggested_return: string;
  /** Peak trucks short across the run, ignoring what we have already rented. */
  trucks_needed: number;
  /** Peak still short after existing rentals are counted. 0 means handled. */
  trucks_uncovered: number;
  /** needed_from minus the lead time. Past this, booking is a gamble. */
  book_by: string;
  state: WindowState;
  days: WindowDay[];
}

/** Add days to a yyyy-MM-dd string without ever touching local time. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Saturday or Sunday. Holidays are not modelled — that needs a real calendar. */
function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Step back `n` BUSINESS days from `date`.
 *
 * Booking lead time is counted in business days, not calendar days: a gap on a
 * Tuesday with five days' lead is not "book by last Thursday", it is "book by
 * the Tuesday before", because nobody at the vendor is answering the phone at
 * the weekend. Counting calendar days quietly moves every deadline into a
 * Saturday roughly two times in seven.
 */
export function subtractBusinessDays(date: string, n: number): string {
  let cursor = date;
  let left = n;
  while (left > 0) {
    cursor = addDays(cursor, -1);
    if (!isWeekend(cursor)) left -= 1;
  }
  return cursor;
}

/** Whole days from `a` to `b`, negative if `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function coverageOn(date: string, coverage: RentalCoverage[]): number {
  return coverage.filter((c) => c.needed_from <= date && date <= c.est_return_date).length;
}

export interface BuildWindowsInput {
  /** Demand rows for the horizon. Missing days are treated as zero demand. */
  days: DemandDay[];
  /** Trucks we own — see getOwnedTruckCapacity(). */
  capacity: number;
  /** Rentals already booked or out, which cover part of the shortfall. */
  coverage: RentalCoverage[];
  /** Today in America/New_York, yyyy-MM-dd. */
  today: string;
  /** How far ahead the horizon runs, in days. */
  horizonDays: number;
  /** Book at least this many BUSINESS days before the truck is needed. */
  leadTimeDays: number;
  /**
   * Two short runs separated by this many good days (or fewer) are one rental.
   * Returning a truck and re-renting it the next morning costs more than keeping
   * it over the quiet day.
   */
  bridgeDays: number;
}

export function buildWindows(input: BuildWindowsInput): RentalWindow[] {
  const { days, capacity, coverage, today, horizonDays, leadTimeDays, bridgeDays } = input;

  // With no owned trucks resolved, every day would look short. That is a broken
  // fleet registry, not a rental plan — say nothing rather than cry wolf daily.
  if (capacity <= 0) return [];

  const demandByDate = new Map(days.map((d) => [d.date, d.demand]));

  // Walk the calendar, not the rows: a day with no booked jobs has no row at all,
  // and it is exactly those quiet days that separate one rental from the next.
  const timeline: WindowDay[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const demand = demandByDate.get(date) ?? 0;
    timeline.push({
      date,
      demand,
      shortfall: Math.max(0, demand - capacity),
      covered: coverageOn(date, coverage),
    });
  }

  // Runs of consecutive short days.
  const runs: WindowDay[][] = [];
  let current: WindowDay[] = [];
  for (const day of timeline) {
    if (day.shortfall > 0) {
      current.push(day);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);

  // Merge runs separated by a short enough gap, carrying the in-between days so
  // the window still shows what the quiet day looked like.
  const merged: WindowDay[][] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous) {
      const gap = daysBetween(previous[previous.length - 1].date, run[0].date) - 1;
      if (gap <= bridgeDays) {
        const from = timeline.findIndex((d) => d.date === previous[previous.length - 1].date);
        const to = timeline.findIndex((d) => d.date === run[0].date);
        previous.push(...timeline.slice(from + 1, to), ...run);
        continue;
      }
    }
    merged.push([...run]);
  }

  return merged.map((run) => {
    const needed_from = run[0].date;
    // The last day we are actually SHORT, which is not the last day of the run
    // once a bridge day has been folded in.
    const shortDays = run.filter((d) => d.shortfall > 0);
    const last_needed = shortDays[shortDays.length - 1].date;

    const trucks_needed = Math.max(...shortDays.map((d) => d.shortfall));
    const trucks_uncovered = Math.max(...shortDays.map((d) => d.shortfall - d.covered), 0);
    const book_by = subtractBusinessDays(needed_from, leadTimeDays);

    let state: WindowState;
    if (trucks_uncovered <= 0) state = 'covered';
    else if (today >= needed_from) state = 'late';
    else if (today >= book_by) state = 'book_now';
    else state = 'planned';

    return {
      needed_from,
      last_needed,
      suggested_return: addDays(last_needed, 1),
      trucks_needed,
      trucks_uncovered,
      book_by,
      state,
      days: run,
    };
  });
}

export type DriftKind = 'extend' | 'early' | 'none';

export interface Drift {
  kind: DriftKind;
  /** The return date the booked work now implies. */
  suggested_return: string;
  /** Whole days of difference; always positive, read with `kind`. */
  days: number;
}

/**
 * Compare a rental we hold against freshly computed windows.
 *
 * This is the answer to "we had no good way to know when it should go back": the
 * work moves after the reservation is made, and nothing today re-checks it.
 */
export function driftFor(rental: RentalCoverage, windows: RentalWindow[]): Drift {
  // The window this rental is covering: any overlap with what it spans.
  const window = windows.find(
    (w) => w.needed_from <= rental.est_return_date && rental.needed_from <= w.last_needed
  );
  if (!window) return { kind: 'none', suggested_return: rental.est_return_date, days: 0 };

  const delta = daysBetween(rental.est_return_date, window.suggested_return);
  if (delta > 0) return { kind: 'extend', suggested_return: window.suggested_return, days: delta };
  if (delta < 0) return { kind: 'early', suggested_return: window.suggested_return, days: -delta };
  return { kind: 'none', suggested_return: rental.est_return_date, days: 0 };
}
