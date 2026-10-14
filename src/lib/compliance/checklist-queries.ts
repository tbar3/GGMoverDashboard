import { query } from '@/lib/db';
import { COMPLIANCE_STATE_SQL, DAYS_UNTIL_SQL, PM_STATE_SQL, TODAY_SQL } from './status';
import { VEHICLE_PM } from './checklists';
import type {
  DriverChecklistRow,
  FleetChecklistRow,
  SlotCheck,
  SlotItem,
  SlotPm,
} from './checklists';
import type { ComplianceAttachment } from './types';

/**
 * Reads for the owned-truck and driver checklist grids. Same rules as queries.ts:
 * no 'use server', callers live under the guarded /admin tree.
 *
 * Each grid is a handful of flat queries stitched together here rather than one
 * wide pivot: the slot lists live in checklists.ts, and a pivot would have to
 * repeat them in SQL and drift the first time a slot is added.
 */

type CheckRow = SlotCheck & { parent_id: string; check_key: string };
type ItemRow = Omit<SlotItem, 'files'> & { parent_id: string; standard_key: string };
type FileRow = ComplianceAttachment & { item_id: string };

async function slotItems(column: 'vehicle_id' | 'entity_employee_id', ids: string[]) {
  const items = await query<ItemRow>(
    `SELECT i.id, i.${column} AS parent_id, i.standard_key,
            i.issue_date::text AS issue_date, i.expiration_date::text AS expiration_date,
            ${COMPLIANCE_STATE_SQL} AS state, ${DAYS_UNTIL_SQL} AS days_until
       FROM compliance_items i
      WHERE i.${column} = ANY($1::uuid[]) AND i.standard_key IS NOT NULL`,
    [ids]
  );
  const files = items.length
    ? await query<FileRow>(
        `SELECT a.id, a.item_id, a.document_id, a.created_at,
                d.title, d.original_filename, d.content_type, d.size_bytes, d.uploaded_by_name
           FROM compliance_attachments a
           JOIN documents d ON d.id = a.document_id
          WHERE a.item_id = ANY($1::uuid[])
          ORDER BY a.created_at DESC`,
        [items.map((i) => i.id)]
      )
    : [];

  const byParent = new Map<string, Record<string, SlotItem>>();
  for (const item of items) {
    const slots = byParent.get(item.parent_id) ?? {};
    slots[item.standard_key] = {
      id: item.id,
      issue_date: item.issue_date,
      expiration_date: item.expiration_date,
      state: item.state,
      days_until: item.days_until,
      files: files.filter((f) => f.item_id === item.id),
    };
    byParent.set(item.parent_id, slots);
  }
  return byParent;
}

async function slotChecks(column: 'vehicle_id' | 'employee_id', ids: string[]) {
  const rows = await query<CheckRow>(
    `SELECT ${column} AS parent_id, check_key, checked,
            checked_on::text AS checked_on, checked_by_name
       FROM compliance_checks
      WHERE ${column} = ANY($1::uuid[])`,
    [ids]
  );
  const byParent = new Map<string, Record<string, SlotCheck>>();
  for (const row of rows) {
    const slots = byParent.get(row.parent_id) ?? {};
    slots[row.check_key] = {
      checked: row.checked,
      checked_on: row.checked_on,
      checked_by_name: row.checked_by_name,
    };
    byParent.set(row.parent_id, slots);
  }
  return byParent;
}

/**
 * Every active OWNED truck. Leased and rented units are left off on purpose —
 * the lessor carries their PM and paperwork — but they keep their full record on
 * the vehicle page.
 */
export async function getFleetChecklist(): Promise<FleetChecklistRow[]> {
  const vehicles = await query<{
    id: string;
    name: string;
    current_odometer: number | null;
    odometer_updated_on: string | null;
  }>(
    `SELECT id, name, current_odometer, odometer_updated_on::text AS odometer_updated_on
       FROM vehicles
      WHERE active = TRUE AND ownership = 'owned'
      ORDER BY name`
  );
  if (vehicles.length === 0) return [];
  const ids = vehicles.map((v) => v.id);

  const serviceTypes = VEHICLE_PM.map((p) => p.serviceType);
  const [checks, items, schedules] = await Promise.all([
    slotChecks('vehicle_id', ids),
    slotItems('vehicle_id', ids),
    // The unnamed schedule of each service type is the checklist's slot. A named
    // 'other' schedule is something else the truck needs and stays on its page.
    query<SlotPm & { vehicle_id: string; service_type: string }>(
      `SELECT s.id, s.vehicle_id, s.service_type,
              s.last_service_date::text AS last_service_date, s.last_service_odometer,
              s.next_due_date::text AS next_due_date, s.next_due_odometer,
              s.interval_miles, s.interval_days,
              ${PM_STATE_SQL} AS state,
              (s.next_due_date - ${TODAY_SQL}) AS days_until,
              (s.next_due_odometer - v.current_odometer) AS miles_remaining
         FROM vehicle_pm_schedules s
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.vehicle_id = ANY($1::uuid[]) AND s.active
          AND s.service_type = ANY($2::text[]) AND s.custom_label IS NULL`,
      [ids, serviceTypes]
    ),
  ]);

  return vehicles.map((v) => {
    const pm: Record<string, SlotPm> = {};
    for (const slot of VEHICLE_PM) {
      const s = schedules.find((x) => x.vehicle_id === v.id && x.service_type === slot.serviceType);
      if (s) pm[slot.key] = s;
    }
    return {
      vehicle_id: v.id,
      name: v.name,
      current_odometer: v.current_odometer,
      odometer_updated_on: v.odometer_updated_on,
      checks: checks.get(v.id) ?? {},
      items: items.get(v.id) ?? {},
      pm,
    };
  });
}

/** Every active employee with the Driver role. */
export async function getDriverChecklist(): Promise<DriverChecklistRow[]> {
  const drivers = await query<{ id: string; name: string; hire_date: string | null }>(
    `SELECT id, name, start_date::text AS hire_date
       FROM employees
      WHERE is_active = TRUE AND role = 'driver'
      ORDER BY name`
  );
  if (drivers.length === 0) return [];
  const ids = drivers.map((d) => d.id);

  const [checks, items] = await Promise.all([
    slotChecks('employee_id', ids),
    slotItems('entity_employee_id', ids),
  ]);

  return drivers.map((d) => ({
    employee_id: d.id,
    name: d.name,
    hire_date: d.hire_date,
    checks: checks.get(d.id) ?? {},
    items: items.get(d.id) ?? {},
  }));
}
