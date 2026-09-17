/**
 * Rental board — the read layer.
 *
 * Three questions, none of which the app could answer before:
 *   1. When do we have to BOOK? Demand windows minus a lead time.
 *   2. When should it go BACK? The day after the last day we are short — and
 *      re-checked against new bookings, because the work moves after we reserve.
 *   3. What has to happen before it CAN go back? The offload checklist, with the
 *      materials item read from real stock instead of asked.
 *
 * Back office only. Every caller sits under /admin, guarded by the admin layout,
 * and every write self-guards again.
 */

import { query, queryOne } from '@/lib/db';
import { getNumberSetting } from '@/lib/settings';
import { CONFIG } from '@/types';
import { getOwnedTruckCapacity } from '@/lib/truck-capacity';
import {
  buildWindows,
  driftFor,
  type DemandDay,
  type RentalWindow,
  type Drift,
} from '@/lib/rentals-windows';
import type {
  TruckRental,
  OffloadItem,
  OffloadCheck,
  RentalOffloadState,
  WarehouseOption,
} from '@/lib/rentals-shared';

export * from '@/lib/rentals-shared';

/** Today in America/New_York, as yyyy-MM-dd. */
export async function rentalToday(): Promise<string> {
  const row = await queryOne<{ d: string }>(
    "SELECT (NOW() AT TIME ZONE 'America/New_York')::date::text AS d"
  );
  return row!.d;
}

export async function getLeadTimeDays(): Promise<number> {
  return getNumberSetting('rental_lead_time_days', CONFIG.RENTAL_LEAD_TIME_DAYS);
}

/**
 * Trucks needed per day across the horizon, from booked work.
 *
 * CEIL because trucks are discrete: 2.5 estimated trucks means three trucks in
 * the yard, and rounding down is how you end up one short on the morning.
 */
export async function getDemandDays(today: string, horizonDays: number): Promise<DemandDay[]> {
  return query<DemandDay>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date,
            CEIL(COALESCE(SUM(quoted_trucks), 0))::int AS demand
       FROM jobs
      WHERE date >= $1::date
        AND date < $1::date + $2::int
      GROUP BY date
      ORDER BY date`,
    [today, horizonDays]
  );
}

/**
 * Upcoming jobs with no truck quoted.
 *
 * Surfaced rather than swallowed: a NULL quoted_trucks counts as zero demand, so
 * a day can look covered purely because nobody filled the number in.
 */
export async function getJobsMissingEstimate(today: string, horizonDays: number): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int AS c
       FROM jobs
      WHERE date >= $1::date
        AND date < $1::date + $2::int
        AND COALESCE(quoted_trucks, 0) = 0`,
    [today, horizonDays]
  );
  return row?.c ?? 0;
}

/**
 * When the schedule this forecast reads was last synced.
 *
 * Demand comes from the calendar-synced `jobs` table, NOT from smartmoving_jobs.
 * That import is a trailing weekly report: as of this writing it had stopped
 * months earlier and held nothing dated in the future, so a forecast built on it
 * would have been permanently, silently empty. `jobs` is the live schedule and
 * carries quoted_trucks per move.
 */
export async function getDataAsOf(): Promise<string | null> {
  const row = await queryOne<{ synced_at: string | null }>(
    "SELECT to_char(MAX(synced_at), 'Mon DD, YYYY') AS synced_at FROM jobs"
  );
  return row?.synced_at ?? null;
}

const RENTAL_SELECT = `
  SELECT r.id, r.vendor, r.vendor_ref, r.size,
         r.needed_from::text    AS needed_from,
         r.est_return_date::text AS est_return_date,
         -- HH:MM, so the client never has to parse a Postgres time literal.
         to_char(r.pickup_time, 'HH24:MI') AS pickup_time,
         r.has_ramp, r.has_liftgate, r.is_isuzu,
         r.status, r.picked_up_at, r.returned_at,
         r.truck_id, t.name AS truck_name, r.vehicle_id,
         r.daily_rate::float8 AS daily_rate,
         r.notes, r.created_by_name, r.created_at
    FROM truck_rentals r
    LEFT JOIN trucks t ON t.id = r.truck_id`;

/** Rentals still in play: planned, booked, or out on the road. */
export async function getActiveRentals(): Promise<TruckRental[]> {
  return query<TruckRental>(
    `${RENTAL_SELECT}
      WHERE r.status IN ('planned', 'booked', 'picked_up')
      ORDER BY r.needed_from, r.created_at`
  );
}

/** Closed-out rentals, newest first. */
export async function getRentalHistory(limit = 25): Promise<TruckRental[]> {
  return query<TruckRental>(
    `${RENTAL_SELECT}
      WHERE r.status IN ('returned', 'cancelled')
      ORDER BY COALESCE(r.returned_at, r.updated_at) DESC
      LIMIT $1`,
    [limit]
  );
}

export async function getOffloadItems(): Promise<OffloadItem[]> {
  return query<OffloadItem>(
    `SELECT id, label, system_key, sort_order
       FROM rental_offload_items
      WHERE active = TRUE
      ORDER BY sort_order, id`
  );
}

/**
 * Warehouses a rental truck can call home.
 *
 * Required at pickup: offloadFromTruck refuses to move stock off a truck with no
 * home warehouse, so a rental set up without one cannot be offloaded — which is
 * discovered days later, with the truck full and due back.
 */
export async function getWarehouses(): Promise<WarehouseOption[]> {
  return query<WarehouseOption>(
    'SELECT id, name FROM warehouses WHERE active = TRUE ORDER BY sort_order, name'
  );
}

/** How many distinct materials are still sitting on a truck. */
export async function getMaterialsRemaining(truckId: number): Promise<number> {
  const row = await queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM truck_stock WHERE truck_id = $1 AND on_hand > 0',
    [truckId]
  );
  return row?.c ?? 0;
}

/**
 * The return gate for one rental: what has been ticked, what is still on the
 * truck, and whether it can go back.
 */
export async function getOffloadState(
  rental: TruckRental,
  items: OffloadItem[]
): Promise<RentalOffloadState> {
  const checks = await query<OffloadCheck>(
    `SELECT item_id, checked_at, checked_by_name
       FROM rental_offload_checks
      WHERE rental_id = $1`,
    [rental.id]
  );

  const materials_remaining = rental.truck_id ? await getMaterialsRemaining(rental.truck_id) : 0;

  const checkedIds = new Set(checks.map((c) => c.item_id));
  const unticked = items.filter((i) => !checkedIds.has(i.id));

  // Materials are the one item we can verify, so it is verified rather than
  // trusted: a tick does not clear the gate while stock is still on board.
  let blocking_reason: string | null = null;
  if (materials_remaining > 0) {
    blocking_reason = `${materials_remaining} material${
      materials_remaining === 1 ? '' : 's'
    } still on the truck`;
  } else if (unticked.length > 0) {
    blocking_reason = `${unticked.length} checklist item${
      unticked.length === 1 ? '' : 's'
    } left`;
  }

  return {
    rental_id: rental.id,
    checks,
    materials_remaining,
    can_return: blocking_reason === null,
    blocking_reason,
  };
}

export interface RentalBoardData {
  today: string;
  windows: RentalWindow[];
  active: TruckRental[];
  history: TruckRental[];
  items: OffloadItem[];
  offload: Record<string, RentalOffloadState>;
  drift: Record<string, Drift>;
  capacity: number;
  leadTimeDays: number;
  horizonDays: number;
  jobsMissingEstimate: number;
  dataAsOf: string | null;
}

/** Everything the board renders, in one call. */
export async function getRentalBoard(): Promise<RentalBoardData> {
  const today = await rentalToday();
  const horizonDays = CONFIG.RENTAL_HORIZON_DAYS;

  const [capacity, leadTimeDays, days, active, history, items, jobsMissingEstimate, dataAsOf] =
    await Promise.all([
      getOwnedTruckCapacity(),
      getLeadTimeDays(),
      getDemandDays(today, horizonDays),
      getActiveRentals(),
      getRentalHistory(),
      getOffloadItems(),
      getJobsMissingEstimate(today, horizonDays),
      getDataAsOf(),
    ]);

  // Only rentals we actually hold or have reserved cover a shortfall. A 'planned'
  // row is an intention, not a truck.
  const coverage = active
    .filter((r) => r.status === 'booked' || r.status === 'picked_up')
    .map((r) => ({ needed_from: r.needed_from, est_return_date: r.est_return_date }));

  const windows = buildWindows({
    days,
    capacity,
    coverage,
    today,
    horizonDays,
    leadTimeDays,
    bridgeDays: CONFIG.RENTAL_BRIDGE_DAYS,
  });

  const out = active.filter((r) => r.status === 'picked_up');
  const offloadStates = await Promise.all(out.map((r) => getOffloadState(r, items)));

  const offload: Record<string, RentalOffloadState> = {};
  for (const state of offloadStates) offload[state.rental_id] = state;

  const drift: Record<string, Drift> = {};
  for (const rental of active) {
    if (rental.status === 'planned') continue;
    drift[rental.id] = driftFor(
      { needed_from: rental.needed_from, est_return_date: rental.est_return_date },
      windows
    );
  }

  return {
    today,
    windows,
    active,
    history,
    items,
    offload,
    drift,
    capacity,
    leadTimeDays,
    horizonDays,
    jobsMissingEstimate,
    dataAsOf,
  };
}
