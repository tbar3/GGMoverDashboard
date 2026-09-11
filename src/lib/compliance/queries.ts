import { query, queryOne } from '@/lib/db';
import {
  COMPLIANCE_STATE_SQL,
  DAYS_UNTIL_SQL,
  PM_STATE_SQL,
  TODAY_SQL,
  stateOrderSql,
} from './status';
import type {
  ComplianceAttachment,
  ComplianceItem,
  ComplianceItemRow,
  ComplianceRenewal,
  ComplianceState,
  OdometerReading,
  PmScheduleRow,
  ServiceLogEntry,
  Vehicle,
  VehicleRow,
} from './types';

/**
 * Reads for the compliance module. No 'use server' here — server components
 * import these directly, and marking them as actions would make every read a
 * POST endpoint for no reason.
 *
 * Callers are all inside the /admin tree, which is gated by
 * (authenticated)/admin/layout.tsx. Writes guard themselves separately in
 * actions.ts, because a server action is its own entry point.
 */

/** Item columns plus the joined labels every list needs. */
const ITEM_SELECT = `
  SELECT i.*,
         ${COMPLIANCE_STATE_SQL} AS state,
         ${DAYS_UNTIL_SQL}       AS days_until,
         v.name  AS vehicle_name,
         ee.name AS entity_employee_name,
         oe.name AS owner_name,
         (SELECT COUNT(*)::int FROM compliance_attachments a WHERE a.item_id = i.id)
           AS attachment_count
    FROM compliance_items i
    LEFT JOIN vehicles  v  ON v.id  = i.vehicle_id
    LEFT JOIN employees ee ON ee.id = i.entity_employee_id
    LEFT JOIN employees oe ON oe.id = i.owner_employee_id`;

const ITEM_ORDER = `ORDER BY ${stateOrderSql(COMPLIANCE_STATE_SQL)}, i.expiration_date NULLS LAST, i.name`;

export interface ItemFilters {
  status?: string;
  category?: string;
  entityType?: string;
  ownerId?: string;
  vehicleId?: string;
  state?: string;
}

export async function getItems(filters: ItemFilters = {}): Promise<ComplianceItemRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  // Archived and not-applicable items are hidden unless asked for. They are the
  // long tail and they never need action.
  if (filters.status && filters.status !== 'all') {
    params.push(filters.status);
    where.push(`i.status = $${params.length}`);
  } else if (!filters.status) {
    where.push(`i.status = 'active'`);
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`i.category = $${params.length}`);
  }
  if (filters.entityType) {
    params.push(filters.entityType);
    where.push(`i.entity_type = $${params.length}`);
  }
  if (filters.ownerId) {
    params.push(filters.ownerId);
    where.push(`i.owner_employee_id = $${params.length}`);
  }
  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    where.push(`i.vehicle_id = $${params.length}`);
  }
  if (filters.state) {
    params.push(filters.state);
    where.push(`${COMPLIANCE_STATE_SQL} = $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query<ComplianceItemRow>(`${ITEM_SELECT} ${clause} ${ITEM_ORDER}`, params);
}

export async function getItem(id: string): Promise<ComplianceItemRow | null> {
  return queryOne<ComplianceItemRow>(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
}

export interface DashboardBuckets {
  expired: ComplianceItemRow[];
  dueSoon: ComplianceItemRow[];
  okCount: number;
  noExpiryCount: number;
  needsReviewCount: number;
  upcoming: ComplianceItemRow[];
}

/**
 * The overview page, in two round trips rather than five: one pass over active
 * items in memory, since the whole table is a few dozen rows and will stay that
 * way. If it ever isn't, this becomes counts in SQL plus two LIMITed lists.
 */
export async function getDashboardBuckets(): Promise<DashboardBuckets> {
  const rows = await getItems({ status: 'active' });
  return {
    expired: rows.filter((r) => r.state === 'expired'),
    dueSoon: rows.filter((r) => r.state === 'due_soon'),
    okCount: rows.filter((r) => r.state === 'ok').length,
    noExpiryCount: rows.filter((r) => r.state === 'no_expiry').length,
    needsReviewCount: rows.filter((r) => r.needs_review).length,
    // The next quarter, excluding what is already shouting above.
    upcoming: rows.filter(
      (r) => r.state === 'ok' && r.days_until !== null && r.days_until <= 90
    ),
  };
}

/** What this employee is personally on the hook for renewing. */
export async function getMyItems(employeeId: string): Promise<ComplianceItemRow[]> {
  return getItems({ ownerId: employeeId, status: 'active' });
}

/**
 * The nav badge: everything expired or due soon, across items AND PM schedules,
 * in ONE query.
 *
 * This runs on every back-office page load from the layout, so it must stay a
 * single round trip. Both due-date indexes are partial and the row counts are in
 * the dozens, which is what makes that affordable.
 */
export async function getComplianceBadgeCount(): Promise<number> {
  const row = await queryOne<{ n: number }>(`
    WITH item_open AS (
      SELECT COUNT(*)::int AS n
        FROM compliance_items i
       WHERE i.status = 'active'
         AND ${COMPLIANCE_STATE_SQL} IN ('expired', 'due_soon')
    ), pm_open AS (
      SELECT COUNT(*)::int AS n
        FROM vehicle_pm_schedules s
        JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.active AND v.active
         AND ${PM_STATE_SQL} IN ('expired', 'due_soon')
    )
    SELECT (SELECT n FROM item_open) + (SELECT n FROM pm_open) AS n`);
  return row?.n ?? 0;
}

export async function getRenewals(itemId: string): Promise<ComplianceRenewal[]> {
  return query<ComplianceRenewal>(
    `SELECT r.*, e.name AS completed_by_name
       FROM compliance_renewals r
       LEFT JOIN employees e ON e.id = r.completed_by
      WHERE r.item_id = $1
      ORDER BY r.completed_on DESC, r.created_at DESC`,
    [itemId]
  );
}

// ── Pickers ──────────────────────────────────────────────────────────────────

export interface EmployeeOption {
  id: string;
  name: string;
  role: string;
}

export async function getEmployeeOptions(): Promise<EmployeeOption[]> {
  return query<EmployeeOption>(
    `SELECT id, name, role
       FROM employees
      WHERE is_active = TRUE AND COALESCE(exclude_from_roster, FALSE) = FALSE
      ORDER BY name`
  );
}

export async function getVehicleOptions(): Promise<{ id: string; name: string }[]> {
  return query(`SELECT id, name FROM vehicles WHERE active = TRUE ORDER BY name`);
}

// ── Fleet ────────────────────────────────────────────────────────────────────

export async function getVehicles(): Promise<VehicleRow[]> {
  return query<VehicleRow>(`
    WITH item_state AS (
      SELECT i.vehicle_id,
             ${COMPLIANCE_STATE_SQL} AS state
        FROM compliance_items i
       WHERE i.status = 'active' AND i.vehicle_id IS NOT NULL
    ), pm_state AS (
      SELECT s.vehicle_id,
             ${PM_STATE_SQL} AS state
        FROM vehicle_pm_schedules s
        JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.active
    ), combined AS (
      SELECT vehicle_id, state FROM item_state
      UNION ALL
      SELECT vehicle_id, state FROM pm_state
    )
    SELECT v.*,
           COALESCE(
             (SELECT c.state FROM combined c
               WHERE c.vehicle_id = v.id
               ORDER BY ${stateOrderSql('c.state')} LIMIT 1), 'ok') AS worst_state,
           (SELECT COUNT(*)::int FROM combined c
             WHERE c.vehicle_id = v.id AND c.state IN ('expired','due_soon')) AS open_count
      FROM vehicles v
     ORDER BY v.active DESC, v.name`);
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  return queryOne<Vehicle>(`SELECT * FROM vehicles WHERE id = $1`, [id]);
}

/**
 * Materials trucks with no vehicle row yet.
 *
 * The two lists are deliberately not synced — see the migration header. This
 * query is the mitigation: it makes the drift visible on the fleet page as an
 * "add to fleet" prompt, instead of a truck silently having no compliance record.
 */
export async function getUnlinkedTrucks(): Promise<{ id: number; name: string }[]> {
  return query(
    `SELECT t.id, t.name
       FROM trucks t
       LEFT JOIN vehicles v ON v.truck_id = t.id
      WHERE t.active = TRUE AND v.id IS NULL
      ORDER BY t.name`
  );
}

export async function getPmSchedules(vehicleId?: string): Promise<PmScheduleRow[]> {
  const params: unknown[] = [];
  let clause = 'WHERE s.active AND v.active';
  if (vehicleId) {
    params.push(vehicleId);
    clause = `WHERE s.vehicle_id = $1 AND s.active`;
  }
  return query<PmScheduleRow>(
    `SELECT s.*,
            ${PM_STATE_SQL}                     AS state,
            v.name                              AS vehicle_name,
            v.current_odometer                  AS current_odometer,
            (s.next_due_odometer - v.current_odometer) AS miles_remaining,
            (s.next_due_date - ${TODAY_SQL})    AS days_until
       FROM vehicle_pm_schedules s
       JOIN vehicles v ON v.id = s.vehicle_id
       ${clause}
      ORDER BY ${stateOrderSql(PM_STATE_SQL)}, s.next_due_date NULLS LAST, s.service_type`,
    params
  );
}

export async function getServiceLog(vehicleId: string): Promise<ServiceLogEntry[]> {
  return query<ServiceLogEntry>(
    `SELECT l.*, pe.name AS performed_by_name, le.name AS logged_by_name
       FROM vehicle_service_log l
       LEFT JOIN employees pe ON pe.id = l.performed_by
       LEFT JOIN employees le ON le.id = l.logged_by
      WHERE l.vehicle_id = $1
      ORDER BY l.service_date DESC, l.created_at DESC`,
    [vehicleId]
  );
}

export async function getOdometerReadings(
  vehicleId: string,
  limit = 20
): Promise<OdometerReading[]> {
  return query<OdometerReading>(
    `SELECT r.*, e.name AS recorded_by_name
       FROM vehicle_odometer_readings r
       LEFT JOIN employees e ON e.id = r.recorded_by
      WHERE r.vehicle_id = $1
      ORDER BY r.reading_date DESC, r.created_at DESC
      LIMIT $2`,
    [vehicleId, limit]
  );
}

// ── Attachments ──────────────────────────────────────────────────────────────

export type AttachmentParent =
  | { itemId: string }
  | { renewalId: string }
  | { serviceLogId: string }
  | { vehicleId: string };

/** Column each parent kind maps to. Keeps the caller from building SQL. */
function parentColumn(parent: AttachmentParent): [string, string] {
  if ('itemId' in parent) return ['item_id', parent.itemId];
  if ('renewalId' in parent) return ['renewal_id', parent.renewalId];
  if ('serviceLogId' in parent) return ['service_log_id', parent.serviceLogId];
  return ['vehicle_id', parent.vehicleId];
}

export async function getAttachments(parent: AttachmentParent): Promise<ComplianceAttachment[]> {
  const [column, value] = parentColumn(parent);
  return query<ComplianceAttachment>(
    `SELECT a.id, a.document_id, a.created_at,
            d.title, d.original_filename, d.content_type, d.size_bytes, d.uploaded_by_name
       FROM compliance_attachments a
       JOIN documents d ON d.id = a.document_id
      WHERE a.${column} = $1
      ORDER BY a.created_at DESC`,
    [value]
  );
}

/** Every attachment hanging off an item AND off any of its renewals. */
export async function getItemAttachments(itemId: string): Promise<ComplianceAttachment[]> {
  return query<ComplianceAttachment>(
    `SELECT a.id, a.document_id, a.created_at,
            d.title, d.original_filename, d.content_type, d.size_bytes, d.uploaded_by_name
       FROM compliance_attachments a
       JOIN documents d ON d.id = a.document_id
       LEFT JOIN compliance_renewals r ON r.id = a.renewal_id
      WHERE a.item_id = $1 OR r.item_id = $1
      ORDER BY a.created_at DESC`,
    [itemId]
  );
}

export type { ComplianceItem, ComplianceState };
