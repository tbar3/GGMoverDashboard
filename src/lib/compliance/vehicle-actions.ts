'use server';

import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { PM_SERVICE_TYPES, VEHICLE_TYPES, OWNERSHIP_TYPES } from './types';

/** Fleet, preventative maintenance, and odometer writes. Back office only. */

type Result = { ok: boolean; error?: string };

const VEHICLE_TYPE_SET = new Set<string>(VEHICLE_TYPES.map((v) => v.value));
const OWNERSHIP_SET = new Set<string>(OWNERSHIP_TYPES.map((o) => o.value));
const SERVICE_TYPE_SET = new Set<string>(PM_SERVICE_TYPES.map((s) => s.value));

function revalidate() {
  revalidatePath('/admin', 'layout');
  // Fleet also writes the materials truck list crews pick from.
  revalidatePath('/materials', 'layout');
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export interface VehicleInput {
  id?: string;
  name: string;
  vehicleType: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  plateState: string;
  gvwrLbs?: number | null;
  isCmv: boolean;
  ownership: string;
  motiveVehicleId?: string | null;
  inServiceDate?: string | null;
  active: boolean;
  notes?: string | null;
  /** On the Materials count sheets — i.e. it has a `trucks` row crews load. */
  onTruckSheets: boolean;
  /** Where loading pulls from. Required when on the truck sheets. */
  warehouseId?: number | null;
  /** How the calendar names it on jobs. */
  calendarNames?: string[];
}

class SaveError extends Error {}

/**
 * Save a vehicle AND its materials truck, together.
 *
 * Fleet is the one place a truck is managed. A vehicle (compliance) and a truck
 * (materials) are still two rows — merging them would touch every materials and
 * rental query — but they are written in one transaction here, so the name, the
 * active flag and the warehouse can no longer drift apart. Jobs match on name
 * and calendar names, so those are kept unique across the fleet.
 *
 * Rented vehicles are the exception. Their lifecycle belongs to the Rental Trucks
 * board: pickup creates the truck, return retires it only once it is offloaded.
 * Letting Fleet add, retire, reactivate or re-own one would skip that gate, so
 * those fields are kept as they are and only the paperwork fields are editable.
 */
export async function saveVehicle(input: VehicleInput): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give the vehicle a name' };
  if (!VEHICLE_TYPE_SET.has(input.vehicleType)) return { ok: false, error: 'Unknown vehicle type' };
  if (!OWNERSHIP_SET.has(input.ownership)) return { ok: false, error: 'Unknown ownership type' };

  const existing = input.id
    ? await queryOne<{
        ownership: string;
        active: boolean;
        truck_id: number | null;
        truck_active: boolean | null;
      }>(
        `SELECT v.ownership, v.active, v.truck_id, t.active AS truck_active
           FROM vehicles v LEFT JOIN trucks t ON t.id = v.truck_id
          WHERE v.id = $1`,
        [input.id]
      )
    : null;
  if (input.id && !existing) return { ok: false, error: 'That vehicle no longer exists' };

  const isRental = existing?.ownership === 'rented';
  if (!isRental && input.ownership === 'rented') {
    return {
      ok: false,
      error: 'Rental trucks are added from the Rental Trucks board when they are picked up',
    };
  }

  const ownership = isRental ? 'rented' : input.ownership;
  const active = isRental ? existing!.active : input.active;
  const onTruckSheets = isRental ? existing!.truck_id !== null : input.onTruckSheets;
  const warehouseId = input.warehouseId ?? null;
  if (onTruckSheets && !warehouseId) {
    return { ok: false, error: 'Pick a home warehouse — loading pulls from there' };
  }

  // Taking a truck off the road with stock still on it strands that stock: it
  // stays counted on a truck no crew can see. Same gate as returning a rental.
  const leavingSheets =
    !isRental &&
    existing?.truck_id &&
    existing.truck_active &&
    (!active || !onTruckSheets);
  if (leavingSheets) {
    const left = await queryOne<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM truck_stock WHERE truck_id = $1 AND on_hand > 0',
      [existing!.truck_id]
    );
    if (left && left.c > 0) {
      return {
        ok: false,
        error: `${left.c} material${left.c === 1 ? ' is' : 's are'} still on this truck — offload it in Materials first`,
      };
    }
  }

  const vin = clean(input.vin)?.toUpperCase() ?? null;
  if (vin) {
    const clash = await queryOne<{ name: string }>(
      'SELECT name FROM vehicles WHERE vin = $1 AND ($2::uuid IS NULL OR id <> $2)',
      [vin, input.id ?? null]
    );
    if (clash) return { ok: false, error: `That VIN is already on ${clash.name}` };
  }

  // Calendar names: trimmed, de-duplicated without regard to case, and not
  // already claimed by another vehicle — one calendar name has to mean one truck.
  const seen = new Set<string>();
  const calendarNames: string[] = [];
  for (const raw of input.calendarNames ?? []) {
    const n = raw.trim();
    if (!n || seen.has(n.toLowerCase()) || n.toLowerCase() === name.toLowerCase()) continue;
    seen.add(n.toLowerCase());
    calendarNames.push(n);
  }
  const allNames = [name, ...calendarNames].map((n) => n.toLowerCase());
  const nameClash = await queryOne<{ name: string }>(
    `SELECT v.name FROM vehicles v
      WHERE ($1::uuid IS NULL OR v.id <> $1)
        AND (LOWER(v.name) = ANY($2::text[])
             OR EXISTS (SELECT 1 FROM unnest(v.calendar_names) c WHERE LOWER(c) = ANY($2::text[])))
      LIMIT 1`,
    [input.id ?? null, allNames]
  );
  if (nameClash) {
    return { ok: false, error: `${nameClash.name} already goes by one of those names` };
  }

  try {
    await withTransaction(async (client) => {
      // A materials truck with this name that no vehicle claims — e.g. one added
      // in Materials before Fleet existed — is adopted rather than duplicated.
      const truckByName = await client.query<{ id: number; claimed: boolean }>(
        `SELECT t.id, EXISTS (SELECT 1 FROM vehicles v WHERE v.truck_id = t.id) AS claimed
           FROM trucks t
          WHERE LOWER(t.name) = LOWER($1) AND ($2::int IS NULL OR t.id <> $2)`,
        [name, existing?.truck_id ?? null]
      );
      const other = truckByName.rows[0];
      if (other && (other.claimed || existing?.truck_id)) {
        throw new SaveError('A Materials truck already has that name');
      }

      const params = [
        name,
        input.vehicleType,
        input.year ?? null,
        clean(input.make),
        clean(input.model),
        vin,
        clean(input.licensePlate)?.toUpperCase() ?? null,
        input.plateState.trim().toUpperCase() || 'GA',
        input.gvwrLbs ?? null,
        input.isCmv,
        ownership,
        clean(input.motiveVehicleId),
        clean(input.inServiceDate),
        active,
        clean(input.notes),
        calendarNames,
      ];

      let vehicleId = input.id;
      if (vehicleId) {
        await client.query(
          `UPDATE vehicles
              SET name = $2, vehicle_type = $3, year = $4, make = $5,
                  model = $6, vin = $7, license_plate = $8, plate_state = $9,
                  gvwr_lbs = $10, is_cmv = $11, ownership = $12, motive_vehicle_id = $13,
                  in_service_date = $14, active = $15, notes = $16, calendar_names = $17,
                  updated_at = NOW()
            WHERE id = $1`,
          [vehicleId, ...params]
        );
      } else {
        const row = await client.query<{ id: string }>(
          `INSERT INTO vehicles
             (name, vehicle_type, year, make, model, vin, license_plate,
              plate_state, gvwr_lbs, is_cmv, ownership, motive_vehicle_id,
              in_service_date, active, notes, calendar_names)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          params
        );
        vehicleId = row.rows[0].id;
      }

      let truckId = existing?.truck_id ?? null;
      if (truckId) {
        // Name always follows the vehicle. A rental's active flag is the rental
        // board's to change, so it is left alone.
        await client.query(
          `UPDATE trucks
              SET name = $2,
                  warehouse_id = COALESCE($3, warehouse_id),
                  active = CASE WHEN $4::boolean IS NULL THEN active ELSE $4 END,
                  updated_at = NOW()
            WHERE id = $1`,
          [truckId, name, warehouseId, isRental ? null : active && onTruckSheets]
        );
      } else if (onTruckSheets) {
        if (other) {
          truckId = other.id;
          await client.query(
            `UPDATE trucks SET warehouse_id = $2, active = $3, updated_at = NOW() WHERE id = $1`,
            [truckId, warehouseId, active]
          );
        } else {
          const t = await client.query<{ id: number }>(
            `INSERT INTO trucks (name, sort_order, warehouse_id, active)
             VALUES ($1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM trucks), $2, $3)
             RETURNING id`,
            [name, warehouseId, active]
          );
          truckId = t.rows[0].id;
        }
        // Every truck carries a stock row per material, starting at zero.
        await client.query(
          `INSERT INTO truck_stock (truck_id, material_id)
           SELECT $1, id FROM materials ON CONFLICT DO NOTHING`,
          [truckId]
        );
        await client.query('UPDATE vehicles SET truck_id = $2 WHERE id = $1', [vehicleId, truckId]);
      }
    });
  } catch (err) {
    if (err instanceof SaveError) return { ok: false, error: err.message };
    if ((err as { code?: string })?.code === '23505') {
      return { ok: false, error: 'Another vehicle or truck already has that name' };
    }
    throw err;
  }

  revalidate();
  return { ok: true };
}

/**
 * Move a truck up or down the Materials truck order — the order crews see on
 * the count sheets. Renumbers the whole list, so legacy duplicate sort orders
 * (several trucks at 0) resolve to something stable the first time it is used.
 */
export async function moveVehicle(id: string, direction: 'up' | 'down'): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const trucks = await query<{ id: number; vehicle_id: string | null }>(
    `SELECT t.id, v.id AS vehicle_id
       FROM trucks t LEFT JOIN vehicles v ON v.truck_id = t.id
      ORDER BY t.active DESC, t.sort_order, t.name`
  );
  const i = trucks.findIndex((t) => t.vehicle_id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= trucks.length) return { ok: true };
  [trucks[i], trucks[j]] = [trucks[j], trucks[i]];

  await withTransaction(async (client) => {
    for (let k = 0; k < trucks.length; k++) {
      await client.query('UPDATE trucks SET sort_order = $2, updated_at = NOW() WHERE id = $1', [
        trucks[k].id,
        k + 1,
      ]);
    }
  });
  revalidate();
  return { ok: true };
}

/** Record a calendar name against a vehicle, from the unmatched-names prompt. */
export async function addCalendarName(vehicleId: string, calendarName: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const n = calendarName.trim();
  if (!n) return { ok: false, error: 'No name given' };
  const clash = await queryOne<{ name: string }>(
    `SELECT name FROM vehicles
      WHERE id <> $1
        AND (LOWER(name) = LOWER($2)
             OR EXISTS (SELECT 1 FROM unnest(calendar_names) c WHERE LOWER(c) = LOWER($2)))`,
    [vehicleId, n]
  );
  if (clash) return { ok: false, error: `${clash.name} already goes by "${n}"` };

  await query(
    `UPDATE vehicles
        SET calendar_names = array_append(calendar_names, $2), updated_at = NOW()
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM unnest(calendar_names) c WHERE LOWER(c) = LOWER($2))`,
    [vehicleId, n]
  );
  revalidate();
  return { ok: true };
}

/** Create a fleet vehicle from a materials truck that has no record yet. */
export async function addVehicleFromTruck(truckId: number): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const truck = await queryOne<{ name: string }>(
    'SELECT name FROM trucks WHERE id = $1',
    [truckId]
  );
  if (!truck) return { ok: false, error: 'That truck no longer exists' };

  await query(
    `INSERT INTO vehicles (name, truck_id, vehicle_type)
     VALUES ($1, $2, CASE WHEN $1 ILIKE '%trailer%' THEN 'trailer' ELSE 'box_truck' END)
     ON CONFLICT (name) DO UPDATE SET truck_id = EXCLUDED.truck_id, updated_at = NOW()`,
    [truck.name, truckId]
  );
  revalidate();
  return { ok: true };
}

export async function deleteVehicle(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  // Deleting takes the vehicle's compliance items, PM schedules, service history
  // and odometer readings with it. Deactivating keeps all of that readable, which
  // is what you want for a truck that was sold — so the UI offers that first.
  const counts = await queryOne<{ items: number; logs: number }>(
    `SELECT (SELECT COUNT(*)::int FROM compliance_items WHERE vehicle_id = $1) AS items,
            (SELECT COUNT(*)::int FROM vehicle_service_log WHERE vehicle_id = $1) AS logs`,
    [id]
  );
  if (counts && (counts.items > 0 || counts.logs > 0)) {
    return {
      ok: false,
      error:
        'This vehicle has compliance records or service history. Mark it inactive instead, ' +
        'or remove those records first.',
    };
  }

  await query('DELETE FROM vehicles WHERE id = $1', [id]);
  revalidate();
  return { ok: true };
}

// ── Odometer ─────────────────────────────────────────────────────────────────

/**
 * Re-point the vehicle's mirrored odometer at its newest reading.
 *
 * Recomputed from the readings table rather than compared against the value being
 * written, so a back-dated correction cannot leave the mirror ahead of reality —
 * and so a future Motive import lands on the same code path as manual entry.
 */
async function refreshOdometerMirror(client: PoolClient, vehicleId: string): Promise<void> {
  await client.query(
    `UPDATE vehicles v
        SET current_odometer = r.odometer,
            odometer_updated_on = r.reading_date,
            updated_at = NOW()
       FROM (SELECT odometer, reading_date
               FROM vehicle_odometer_readings
              WHERE vehicle_id = $1
              ORDER BY reading_date DESC, created_at DESC
              LIMIT 1) r
      WHERE v.id = $1`,
    [vehicleId]
  );
}

export async function recordOdometer(input: {
  vehicleId: string;
  readingDate: string;
  odometer: number;
  note?: string | null;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!Number.isFinite(input.odometer) || input.odometer < 0) {
    return { ok: false, error: 'Enter a mileage of zero or more' };
  }
  if (!input.readingDate) return { ok: false, error: 'Pick the date of the reading' };

  await withTransaction(async (client) => {
    // Re-entering a day's reading corrects it rather than failing on the unique
    // index — which is also what makes a repeated Motive import a no-op.
    await client.query(
      `INSERT INTO vehicle_odometer_readings
         (vehicle_id, reading_date, odometer, source, note, recorded_by)
       VALUES ($1, $2, $3, 'manual', $4, $5)
       ON CONFLICT (vehicle_id, reading_date, source)
       DO UPDATE SET odometer = EXCLUDED.odometer,
                     note = EXCLUDED.note,
                     recorded_by = EXCLUDED.recorded_by`,
      [input.vehicleId, input.readingDate, Math.round(input.odometer), clean(input.note), guard.employee.id]
    );
    await refreshOdometerMirror(client, input.vehicleId);
  });

  revalidate();
  revalidatePath(`/admin/fleet/${input.vehicleId}`);
  return { ok: true };
}

// ── PM schedules ─────────────────────────────────────────────────────────────

export interface PmScheduleInput {
  id?: string;
  vehicleId: string;
  serviceType: string;
  customLabel?: string | null;
  intervalMiles?: number | null;
  intervalDays?: number | null;
  lastServiceDate?: string | null;
  lastServiceOdometer?: number | null;
  leadTimeDays: number;
  leadMiles: number;
  active: boolean;
  notes?: string | null;
}

export async function savePmSchedule(input: PmScheduleInput): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!SERVICE_TYPE_SET.has(input.serviceType)) return { ok: false, error: 'Unknown service type' };
  if (input.serviceType === 'other' && !clean(input.customLabel)) {
    return { ok: false, error: 'Name the service' };
  }
  // Mirrors the DB CHECK. A schedule with neither clock can never come due, which
  // looks like coverage and provides none.
  if (input.intervalMiles == null && input.intervalDays == null) {
    return { ok: false, error: 'Set a mileage interval, a time interval, or both' };
  }
  if (input.intervalMiles != null && input.intervalMiles <= 0) {
    return { ok: false, error: 'Mileage interval must be greater than zero' };
  }
  if (input.intervalDays != null && input.intervalDays <= 0) {
    return { ok: false, error: 'Time interval must be greater than zero' };
  }

  // next_due_date and next_due_odometer are GENERATED — writing them is an error,
  // and recomputing them here would be a second source of truth anyway.
  const params = [
    input.vehicleId,
    input.serviceType,
    clean(input.customLabel),
    input.intervalMiles ?? null,
    input.intervalDays ?? null,
    clean(input.lastServiceDate),
    input.lastServiceOdometer ?? null,
    input.leadTimeDays,
    input.leadMiles,
    input.active,
    clean(input.notes),
  ];

  try {
    if (input.id) {
      await query(
        `UPDATE vehicle_pm_schedules
            SET vehicle_id = $2, service_type = $3, custom_label = $4,
                interval_miles = $5, interval_days = $6, last_service_date = $7,
                last_service_odometer = $8, lead_time_days = $9, lead_miles = $10,
                active = $11, notes = $12, updated_at = NOW()
          WHERE id = $1`,
        [input.id, ...params]
      );
    } else {
      await query(
        `INSERT INTO vehicle_pm_schedules
           (vehicle_id, service_type, custom_label, interval_miles, interval_days,
            last_service_date, last_service_odometer, lead_time_days, lead_miles, active, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        params
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('idx_pm_schedules_unique')) {
      return { ok: false, error: 'That vehicle already has a schedule for this service' };
    }
    throw err;
  }

  revalidate();
  revalidatePath(`/admin/fleet/${input.vehicleId}`);
  return { ok: true };
}

export async function deletePmSchedule(id: string, vehicleId: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  // Service log entries survive: pm_schedule_id is ON DELETE SET NULL, because
  // what was done to the truck is the vehicle's history, not the schedule's.
  await query('DELETE FROM vehicle_pm_schedules WHERE id = $1', [id]);
  revalidate();
  revalidatePath(`/admin/fleet/${vehicleId}`);
  return { ok: true };
}

// ── Service log ──────────────────────────────────────────────────────────────

export interface ServiceLogInput {
  vehicleId: string;
  pmScheduleId?: string | null;
  serviceType: string;
  description?: string | null;
  serviceDate: string;
  odometer?: number | null;
  vendor?: string | null;
  invoiceNumber?: string | null;
  cost?: number | null;
  performedBy?: string | null;
  notes?: string | null;
}

/**
 * Log a completed service.
 *
 * One transaction doing four things, because they are one event:
 *   1. the log entry — the permanent record of what was done
 *   2. the schedule's baseline, which is what next-due is generated from
 *   3. an odometer reading, so the mileage clock advances too
 *   4. the vehicle's mirrored odometer
 * Splitting these would let a service be logged without resetting the reminder
 * that prompted it, which is the one failure that makes the whole PM page lie.
 */
export async function logService(input: ServiceLogInput): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!input.serviceDate) return { ok: false, error: 'Pick the service date' };
  if (input.odometer != null && (!Number.isFinite(input.odometer) || input.odometer < 0)) {
    return { ok: false, error: 'Enter a mileage of zero or more' };
  }

  const odometer = input.odometer != null ? Math.round(input.odometer) : null;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO vehicle_service_log
         (vehicle_id, pm_schedule_id, service_type, description, service_date,
          odometer, vendor, invoice_number, cost, performed_by, logged_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        input.vehicleId,
        clean(input.pmScheduleId),
        input.serviceType,
        clean(input.description),
        input.serviceDate,
        odometer,
        clean(input.vendor),
        clean(input.invoiceNumber),
        input.cost ?? null,
        clean(input.performedBy),
        guard.employee.id,
        clean(input.notes),
      ]
    );

    if (input.pmScheduleId) {
      // Only move the baseline forward. Back-filling an older service must not
      // make a schedule look freshly done.
      await client.query(
        `UPDATE vehicle_pm_schedules
            SET last_service_date = $2,
                last_service_odometer = COALESCE($3, last_service_odometer),
                updated_at = NOW()
          WHERE id = $1
            AND (last_service_date IS NULL OR last_service_date <= $2::date)`,
        [input.pmScheduleId, input.serviceDate, odometer]
      );
    }

    if (odometer != null) {
      await client.query(
        `INSERT INTO vehicle_odometer_readings
           (vehicle_id, reading_date, odometer, source, note, recorded_by)
         VALUES ($1, $2, $3, 'service_log', 'Recorded with a service entry', $4)
         ON CONFLICT (vehicle_id, reading_date, source)
         DO UPDATE SET odometer = GREATEST(vehicle_odometer_readings.odometer, EXCLUDED.odometer)`,
        [input.vehicleId, input.serviceDate, odometer, guard.employee.id]
      );
      await refreshOdometerMirror(client, input.vehicleId);
    }
  });

  revalidate();
  revalidatePath(`/admin/fleet/${input.vehicleId}`);
  return { ok: true };
}

export async function deleteServiceEntry(id: string, vehicleId: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  await query('DELETE FROM vehicle_service_log WHERE id = $1', [id]);
  revalidate();
  revalidatePath(`/admin/fleet/${vehicleId}`);
  return { ok: true };
}
