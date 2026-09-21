'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { setStringSetting } from '@/lib/settings';
import { getOffloadItems, getMaterialsRemaining } from '@/lib/rentals';

// Rental board writes — back office only. Every action self-guards; the /admin
// layout protects the page, but a server action is its own entry point.

type Result = { ok: boolean; error?: string };

const PATH = '/admin/rentals';

function revalidate() {
  revalidatePath(PATH);
  // The admin home reads owned capacity too, and a pickup changes what is on the
  // truck list.
  revalidatePath('/admin');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badDates(from: string, to: string): string | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'Bad date';
  if (to < from) return 'The return date cannot be before the day it is needed';
  return null;
}

/**
 * Log a rental. `status` is 'planned' for an intention and 'booked' once it is
 * actually reserved — only a booked rental counts as covering a shortfall, because
 * an intention does not put a truck in the yard.
 */
export async function createRental(input: {
  vendor: string;
  vendorRef?: string;
  size?: string;
  neededFrom: string;
  estReturnDate: string;
  /** Planned collection time as "HH:MM", or empty for none. */
  pickupTime?: string;
  hasRamp?: boolean;
  hasLiftgate?: boolean;
  isIsuzu?: boolean;
  dailyRate?: number | null;
  notes?: string;
  /**
   * Where in the lifecycle this rental already is. 'picked_up' means we are
   * logging a truck we ALREADY have, which is not a label change — it has to do
   * the same real work pickUpRental does, so truckName and warehouseId are
   * required with it.
   */
  status?: 'planned' | 'booked' | 'picked_up';
  truckName?: string;
  warehouseId?: number;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const vendor = input.vendor.trim();
  if (!vendor) return { ok: false, error: 'Which vendor?' };

  const dateError = badDates(input.neededFrom, input.estReturnDate);
  if (dateError) return { ok: false, error: dateError };

  // An empty time input posts "", which Postgres would reject as a TIME. Anything
  // that is not HH:MM becomes NULL rather than an error: a missing pickup time is
  // not worth failing a booking over.
  const pickupTime = /^\d{2}:\d{2}$/.test(input.pickupTime ?? '') ? input.pickupTime : null;
  const status = input.status ?? 'planned';

  const truckName = input.truckName?.trim();
  if (status === 'picked_up' && (!truckName || !input.warehouseId)) {
    return {
      ok: false,
      error: 'A truck we already have needs a name and a home warehouse',
    };
  }

  const values = [
    vendor,
    input.vendorRef?.trim() || null,
    input.size?.trim() || null,
    input.neededFrom,
    input.estReturnDate,
    pickupTime,
    input.hasRamp ?? false,
    input.hasLiftgate ?? false,
    input.isIsuzu ?? false,
    status,
    input.dailyRate ?? null,
    input.notes?.trim() || null,
    guard.employee.id,
    guard.employee.name,
  ];

  const insert = `INSERT INTO truck_rentals
       (vendor, vendor_ref, size, needed_from, est_return_date, pickup_time,
        has_ramp, has_liftgate, is_isuzu, status,
        daily_rate, notes, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`;

  if (status !== 'picked_up') {
    await query(insert, values);
    revalidate();
    return { ok: true };
  }

  // Logging a truck already in the yard: the rental row, the materials truck and
  // the fleet vehicle all land together or not at all.
  try {
    await withTransaction(async (client) => {
      const rental = await client.query<{ id: string }>(insert, values);
      const { truckId, vehicleId } = await setUpRentalTruck(
        client,
        truckName!,
        input.warehouseId!
      );
      await client.query(
        `UPDATE truck_rentals
            SET picked_up_at = NOW(), truck_id = $2, vehicle_id = $3, updated_at = NOW()
          WHERE id = $1`,
        [rental.rows[0].id, truckId, vehicleId]
      );
    });
  } catch {
    return { ok: false, error: 'Could not set that truck up. Is the name already taken?' };
  }

  revalidate();
  revalidatePath('/materials');
  return { ok: true };
}

/**
 * Create or revive the materials truck and its fleet vehicle for a rental.
 *
 * Shared by pickUpRental and by logging a rental that is already picked up —
 * two entry points to the same physical event, and they must not drift apart.
 * Both upserts key on name, so a Penske we have rented before comes back to life
 * rather than colliding, and an existing vehicle row flips to 'rented', which is
 * what keeps owned-truck capacity honest.
 */
async function setUpRentalTruck(
  client: import('pg').PoolClient,
  truckName: string,
  warehouseId: number
): Promise<{ truckId: number; vehicleId: string }> {
  const truck = await client.query<{ id: number }>(
    `INSERT INTO trucks (name, sort_order, warehouse_id)
     VALUES ($1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM trucks), $2)
     ON CONFLICT (name) DO UPDATE
        SET active = TRUE, warehouse_id = EXCLUDED.warehouse_id, updated_at = NOW()
     RETURNING id`,
    [truckName, warehouseId]
  );
  const truckId = truck.rows[0].id;

  await client.query(
    `INSERT INTO truck_stock (truck_id, material_id)
     SELECT $1, id FROM materials
     ON CONFLICT DO NOTHING`,
    [truckId]
  );

  const vehicle = await client.query<{ id: string }>(
    `INSERT INTO vehicles (name, truck_id, vehicle_type, ownership)
     VALUES ($1, $2, 'box_truck', 'rented')
     ON CONFLICT (name) DO UPDATE
        SET truck_id = EXCLUDED.truck_id, ownership = 'rented',
            active = TRUE, updated_at = NOW()
     RETURNING id`,
    [truckName, truckId]
  );

  return { truckId, vehicleId: vehicle.rows[0].id };
}

/**
 * Edit a rental's details from its page. Everything except the lifecycle itself —
 * status changes go through their own actions, which do the truck work.
 */
export async function updateRental(input: {
  id: string;
  vendor: string;
  vendorRef?: string;
  size?: string;
  neededFrom: string;
  estReturnDate: string;
  pickupTime?: string;
  hasRamp: boolean;
  hasLiftgate: boolean;
  isIsuzu: boolean;
  dailyRate?: number | null;
  notes?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const vendor = input.vendor.trim();
  if (!vendor) return { ok: false, error: 'Which vendor?' };

  const dateError = badDates(input.neededFrom, input.estReturnDate);
  if (dateError) return { ok: false, error: dateError };

  const pickupTime = /^\d{2}:\d{2}$/.test(input.pickupTime ?? '') ? input.pickupTime : null;

  const row = await queryOne<{ id: string }>(
    `UPDATE truck_rentals
        SET vendor = $2, vendor_ref = $3, size = $4, needed_from = $5,
            est_return_date = $6, pickup_time = $7, has_ramp = $8,
            has_liftgate = $9, is_isuzu = $10, daily_rate = $11, notes = $12,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id`,
    [
      input.id,
      vendor,
      input.vendorRef?.trim() || null,
      input.size?.trim() || null,
      input.neededFrom,
      input.estReturnDate,
      pickupTime,
      input.hasRamp,
      input.hasLiftgate,
      input.isIsuzu,
      input.dailyRate ?? null,
      input.notes?.trim() || null,
    ]
  );
  if (!row) return { ok: false, error: 'That rental is gone' };

  revalidate();
  revalidatePath(`/admin/rentals/${input.id}`);
  return { ok: true };
}

/**
 * Delete a rental outright.
 *
 * Its offload checks go with it (ON DELETE CASCADE). This is for records logged
 * in error — a rental that really happened is history worth keeping, so the UI
 * asks before calling this. A truck still out is deactivated first via the
 * return flow; deleting one would leave the materials truck active with nothing
 * pointing at it.
 */
export async function deleteRental(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const rental = await queryOne<{ status: string }>(
    'SELECT status FROM truck_rentals WHERE id = $1',
    [id]
  );
  if (!rental) return { ok: false, error: 'That rental is already gone' };
  if (rental.status === 'picked_up') {
    return { ok: false, error: 'Return it first — the truck is still out' };
  }

  await query('DELETE FROM truck_rentals WHERE id = $1', [id]);
  revalidate();
  return { ok: true };
}

/** Mark a planned rental as actually reserved. */
export async function bookRental(input: { id: string; vendorRef?: string }): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  await query(
    `UPDATE truck_rentals
        SET status = 'booked',
            vendor_ref = COALESCE($2, vendor_ref),
            updated_at = NOW()
      WHERE id = $1 AND status = 'planned'`,
    [input.id, input.vendorRef?.trim() || null]
  );
  revalidate();
  return { ok: true };
}

/** Move the dates — used to accept a drift suggestion in one click. */
export async function updateRentalDates(input: {
  id: string;
  neededFrom: string;
  estReturnDate: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const dateError = badDates(input.neededFrom, input.estReturnDate);
  if (dateError) return { ok: false, error: dateError };

  await query(
    `UPDATE truck_rentals
        SET needed_from = $2, est_return_date = $3, updated_at = NOW()
      WHERE id = $1 AND status <> 'returned'`,
    [input.id, input.neededFrom, input.estReturnDate]
  );
  revalidate();
  return { ok: true };
}

/**
 * Set the pick-up time and what the truck is, on a rental that already exists.
 *
 * These are on the booking form too, but they cannot only live there: the
 * collection time is frequently not known when the reservation is made, and a
 * rental booked without one would otherwise never be able to record one. Editable
 * until the rental is closed out.
 */
export async function updateRentalDetails(input: {
  id: string;
  pickupTime?: string;
  hasRamp: boolean;
  hasLiftgate: boolean;
  isIsuzu: boolean;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  // Same rule as createRental: an empty time input posts "", which is not a TIME.
  const pickupTime = /^\d{2}:\d{2}$/.test(input.pickupTime ?? '') ? input.pickupTime : null;

  const row = await queryOne<{ id: string }>(
    `UPDATE truck_rentals
        SET pickup_time = $2, has_ramp = $3, has_liftgate = $4, is_isuzu = $5,
            updated_at = NOW()
      WHERE id = $1 AND status <> 'returned'
      RETURNING id`,
    [input.id, pickupTime, input.hasRamp, input.hasLiftgate, input.isIsuzu]
  );
  if (!row) return { ok: false, error: 'That rental is already closed out' };

  revalidate();
  return { ok: true };
}

/**
 * Pick the truck up: from here it is a working truck.
 *
 * Three writes that must all land or none: the materials truck crews will load,
 * its stock rows, and the fleet vehicle marked as rented. A home warehouse is
 * REQUIRED because offloadFromTruck refuses to run without one — skipping it here
 * breaks the return step days later, when the truck is full and due back.
 *
 * Both upserts key on name, so a Penske we have rented before comes back to life
 * rather than colliding. That also flips an existing vehicle row to 'rented',
 * which is what keeps owned-truck capacity honest.
 */
export async function pickUpRental(input: {
  id: string;
  truckName: string;
  warehouseId: number;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const truckName = input.truckName.trim();
  if (!truckName) return { ok: false, error: 'Name the truck (e.g. "Penske 26 (rental)")' };
  if (!input.warehouseId) {
    return { ok: false, error: 'Pick a home warehouse — offloading needs one' };
  }

  try {
    await withTransaction(async (client) => {
      const { truckId, vehicleId } = await setUpRentalTruck(client, truckName, input.warehouseId);

      await client.query(
        `UPDATE truck_rentals
            SET status = 'picked_up', picked_up_at = NOW(),
                truck_id = $2, vehicle_id = $3, updated_at = NOW()
          WHERE id = $1`,
        [input.id, truckId, vehicleId]
      );
    });
  } catch {
    return { ok: false, error: 'Could not set that truck up. Is the name already taken?' };
  }

  revalidate();
  revalidatePath('/materials');
  return { ok: true };
}

/** Tick or untick one offload item. */
export async function toggleOffloadCheck(input: {
  rentalId: string;
  itemId: number;
  checked: boolean;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (input.checked) {
    await query(
      `INSERT INTO rental_offload_checks (rental_id, item_id, checked_by, checked_by_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (rental_id, item_id) DO NOTHING`,
      [input.rentalId, input.itemId, guard.employee.id, guard.employee.name]
    );
  } else {
    await query('DELETE FROM rental_offload_checks WHERE rental_id = $1 AND item_id = $2', [
      input.rentalId,
      input.itemId,
    ]);
  }
  revalidate();
  return { ok: true };
}

/**
 * Send it back.
 *
 * The gate is re-checked HERE, not trusted from the page: the button may have
 * been rendered before someone loaded materials back onto the truck. Returning
 * deactivates the truck and the vehicle so the rental drops out of the count
 * sheets instead of sitting in every crew's picker forever.
 */
export async function returnRental(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const rental = await queryOne<{ truck_id: number | null; vehicle_id: string | null }>(
    "SELECT truck_id, vehicle_id FROM truck_rentals WHERE id = $1 AND status = 'picked_up'",
    [id]
  );
  if (!rental) return { ok: false, error: 'That rental is not out on the road' };

  if (rental.truck_id) {
    const remaining = await getMaterialsRemaining(rental.truck_id);
    if (remaining > 0) {
      return {
        ok: false,
        error: `${remaining} material${remaining === 1 ? '' : 's'} still on the truck — offload it first`,
      };
    }
  }

  const items = await getOffloadItems();
  const checked = await query<{ item_id: number }>(
    'SELECT item_id FROM rental_offload_checks WHERE rental_id = $1',
    [id]
  );
  const checkedIds = new Set(checked.map((c) => c.item_id));
  const missing = items.filter((i) => !checkedIds.has(i.id));
  if (missing.length > 0) {
    return { ok: false, error: `Still to do: ${missing.map((m) => m.label).join(', ')}` };
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE truck_rentals
          SET status = 'returned', returned_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
    if (rental.truck_id) {
      await client.query('UPDATE trucks SET active = FALSE, updated_at = NOW() WHERE id = $1', [
        rental.truck_id,
      ]);
    }
    if (rental.vehicle_id) {
      await client.query('UPDATE vehicles SET active = FALSE, updated_at = NOW() WHERE id = $1', [
        rental.vehicle_id,
      ]);
    }
  });

  revalidate();
  revalidatePath('/materials');
  return { ok: true };
}

/** Cancel a rental we never picked up. */
export async function cancelRental(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const row = await queryOne<{ id: string }>(
    `UPDATE truck_rentals
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('planned', 'booked')
      RETURNING id`,
    [id]
  );
  if (!row) return { ok: false, error: 'A rental that has been picked up has to be returned' };

  revalidate();
  return { ok: true };
}

/** Book this many days ahead. Editable on the board, where it is understood. */
export async function setRentalLeadTime(days: number): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    return { ok: false, error: 'Give a whole number of days, 0–60' };
  }
  await setStringSetting('rental_lead_time_days', String(days));
  revalidate();
  return { ok: true };
}
