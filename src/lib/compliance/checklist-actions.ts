'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { TODAY_SQL } from './status';
import {
  DRIVER_CHECK_KEYS,
  VEHICLE_CHECK_KEYS,
  VEHICLE_PM,
  findItemSlot,
} from './checklists';
import { recordRenewal } from './actions';
import { uploadAttachment } from './attachment-actions';
import { logService } from './vehicle-actions';

/**
 * Writes for the owned-truck and driver checklists. Back office only; every
 * action self-guards.
 *
 * Nothing here re-implements the module's write paths. Dates go through
 * recordRenewal (so the renewal history and the item's mirrored dates stay in
 * one transaction), files through uploadAttachment (so they are back-office-only
 * documents served by the one guarded download route), and services through
 * logService (so PM baselines and odometer readings move together). This file
 * only finds-or-creates the checklist slot those paths need.
 */

type Result = { ok: boolean; error?: string };
type Entity = 'vehicle' | 'employee';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate() {
  revalidatePath('/admin/compliance', 'layout');
  revalidatePath('/admin', 'layout');
}

async function today(): Promise<string> {
  const row = await queryOne<{ d: string }>(`SELECT ${TODAY_SQL}::text AS d`);
  return row!.d;
}

/** The truck or driver a slot belongs to, or null when the id is not one. */
async function entityName(entity: Entity, id: string): Promise<string | null> {
  const row =
    entity === 'vehicle'
      ? await queryOne<{ name: string }>('SELECT name FROM vehicles WHERE id = $1', [id])
      : await queryOne<{ name: string }>(
          `SELECT name FROM employees WHERE id = $1 AND role = 'driver'`,
          [id]
        );
  return row?.name ?? null;
}

// ── Yes/no boxes ─────────────────────────────────────────────────────────────

export async function setCheck(input: {
  entity: Entity;
  parentId: string;
  key: string;
  checked: boolean;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const keys = input.entity === 'vehicle' ? VEHICLE_CHECK_KEYS : DRIVER_CHECK_KEYS;
  if (!keys.has(input.key)) return { ok: false, error: 'Unknown checklist item' };
  if (!(await entityName(input.entity, input.parentId))) {
    return { ok: false, error: 'That truck or driver no longer exists' };
  }

  const column = input.entity === 'vehicle' ? 'vehicle_id' : 'employee_id';
  await query(
    `INSERT INTO compliance_checks
       (check_key, ${column}, checked, checked_on, checked_by, checked_by_name)
     VALUES ($1, $2, $3, ${TODAY_SQL}, $4, $5)
     ON CONFLICT (${column}, check_key) WHERE ${column} IS NOT NULL
     DO UPDATE SET checked = EXCLUDED.checked, checked_on = EXCLUDED.checked_on,
                   checked_by = EXCLUDED.checked_by,
                   checked_by_name = EXCLUDED.checked_by_name, updated_at = NOW()`,
    [input.key, input.parentId, input.checked, guard.employee.id, guard.employee.name]
  );
  revalidate();
  return { ok: true };
}

// ── Dated / uploaded slots ───────────────────────────────────────────────────

/** Find-or-create the compliance item filling this slot. Returns its id. */
async function ensureSlotItem(
  entity: Entity,
  parentId: string,
  key: string,
  createdBy: string
): Promise<{ id: string } | { error: string }> {
  const slot = findItemSlot(entity, key);
  if (!slot) return { error: 'Unknown checklist item' };
  const name = await entityName(entity, parentId);
  if (!name) return { error: 'That truck or driver no longer exists' };

  const column = entity === 'vehicle' ? 'vehicle_id' : 'entity_employee_id';
  // DO NOTHING + re-select rather than RETURNING: on a conflict RETURNING yields
  // no row, and two people filling the same slot at once must both land on it.
  await query(
    `INSERT INTO compliance_items
       (name, category, entity_type, ${column}, standard_key,
        cadence_months, lead_time_days, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (${column}, standard_key)
       WHERE standard_key IS NOT NULL AND ${column} IS NOT NULL
     DO NOTHING`,
    [
      `${slot.name} — ${name}`,
      slot.category,
      entity,
      parentId,
      slot.key,
      slot.cadenceMonths,
      slot.leadTimeDays,
      createdBy,
    ]
  );
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM compliance_items WHERE ${column} = $1 AND standard_key = $2`,
    [parentId, slot.key]
  );
  return row ?? { error: 'Could not create the checklist item' };
}

/**
 * Save a dated and/or uploaded slot — a DOT inspection, a registration, a
 * medical card, a driver application.
 *
 * FormData because it may carry a file. Fields: entity, parentId, key, and any of
 * issueDate, expirationDate, file, title.
 */
export async function saveSlot(formData: FormData): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const entity = String(formData.get('entity') ?? '') as Entity;
  if (entity !== 'vehicle' && entity !== 'employee') return { ok: false, error: 'Bad request' };
  const parentId = String(formData.get('parentId') ?? '');
  const key = String(formData.get('key') ?? '');
  const issueDate = String(formData.get('issueDate') ?? '').trim() || null;
  const expirationDate = String(formData.get('expirationDate') ?? '').trim() || null;
  const file = formData.get('file');
  const hasFile = file instanceof File && file.size > 0;

  if ((issueDate && !DATE_RE.test(issueDate)) || (expirationDate && !DATE_RE.test(expirationDate))) {
    return { ok: false, error: 'Dates must be YYYY-MM-DD' };
  }
  if (!issueDate && !expirationDate && !hasFile) {
    return { ok: false, error: 'Enter a date or pick a file' };
  }
  if (issueDate && expirationDate && expirationDate < issueDate) {
    return { ok: false, error: 'Expiration cannot be before the date it was done' };
  }

  const item = await ensureSlotItem(entity, parentId, key, guard.employee.id);
  if ('error' in item) return { ok: false, error: item.error };

  if (issueDate || expirationDate) {
    const renewal = await recordRenewal({
      itemId: item.id,
      issueDate,
      expirationDate,
      completedOn: issueDate ?? (await today()),
    });
    if (!renewal.ok) return renewal;
  }

  if (hasFile) {
    const upload = new FormData();
    upload.set('parentKind', 'item');
    upload.set('parentId', item.id);
    upload.set('file', file);
    upload.set('title', String(formData.get('title') ?? ''));
    const result = await uploadAttachment(upload);
    if (!result.ok) return result;
  }

  revalidate();
  return { ok: true };
}

// ── PM and oil change ────────────────────────────────────────────────────────

/**
 * Log a PM or oil change from the grid. Creates the truck's schedule on first
 * use with the default intervals, then hands off to logService, which moves the
 * baseline (and so the next-due date and mileage) and records the odometer.
 */
export async function logSlotService(input: {
  vehicleId: string;
  key: string;
  serviceDate: string;
  odometer: number | null;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const slot = VEHICLE_PM.find((p) => p.key === input.key);
  if (!slot) return { ok: false, error: 'Unknown service' };
  if (!DATE_RE.test(input.serviceDate)) return { ok: false, error: 'Pick the service date' };
  if (!(await entityName('vehicle', input.vehicleId))) {
    return { ok: false, error: 'That truck no longer exists' };
  }

  await query(
    `INSERT INTO vehicle_pm_schedules (vehicle_id, service_type, interval_miles, interval_days)
     SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM vehicle_pm_schedules
         WHERE vehicle_id = $1 AND service_type = $2 AND custom_label IS NULL)`,
    [input.vehicleId, slot.serviceType, slot.intervalMiles, slot.intervalDays]
  );
  // A schedule someone switched off on the truck page comes back on: logging the
  // service from the checklist says the truck is on this clock.
  const schedule = await queryOne<{ id: string }>(
    `UPDATE vehicle_pm_schedules SET active = TRUE, updated_at = NOW()
      WHERE vehicle_id = $1 AND service_type = $2 AND custom_label IS NULL
      RETURNING id`,
    [input.vehicleId, slot.serviceType]
  );
  if (!schedule) return { ok: false, error: 'Could not create the schedule' };

  return logService({
    vehicleId: input.vehicleId,
    pmScheduleId: schedule.id,
    serviceType: slot.serviceType,
    description: slot.label,
    serviceDate: input.serviceDate,
    odometer: input.odometer,
  });
}
