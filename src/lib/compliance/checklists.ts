/**
 * The owned-truck and driver checklists — the single list of what each grid
 * tracks. Client-safe (no DB import) so the grids, the actions and the queries
 * all read the same definitions.
 *
 * Three kinds of slot:
 *   * check — a yes/no box (compliance_checks)
 *   * item  — a dated and/or uploaded record (compliance_items, keyed by
 *             standard_key, files via compliance_attachments)
 *   * pm    — a mileage-and-date maintenance clock (vehicle_pm_schedules)
 */

import type { ComplianceAttachment, ComplianceCategory, PmState } from './types';

export interface CheckSlot {
  key: string;
  label: string;
  /** Column header — short enough for a grid. */
  short: string;
}

export interface ItemSlot {
  key: string;
  /** The compliance item's name; " — <truck/driver>" is appended. */
  name: string;
  short: string;
  category: ComplianceCategory;
  /** Null = no expiry (an uploaded document that never lapses). */
  cadenceMonths: number | null;
  leadTimeDays: number;
  /** What the "last done" date means for this slot, for the dialog label. */
  dateLabel: string | null;
  /** Whether the slot is mainly a file upload. */
  upload: boolean;
}

export interface PmSlot {
  key: 'pm' | 'oil';
  short: string;
  label: string;
  serviceType: string;
  intervalMiles: number;
  intervalDays: number;
}

// ── Owned trucks ─────────────────────────────────────────────────────────────

export const VEHICLE_CHECKS: readonly CheckSlot[] = [
  { key: 'insurance_card', label: 'Insurance card onboard', short: 'Insurance card' },
  { key: 'registration_copy', label: 'Registration copy onboard', short: 'Registration copy' },
  { key: 'hazard_triangles', label: 'Hazard triangles onboard', short: 'Hazard triangles' },
  { key: 'mcs150_listed', label: 'Listed on the DOT MCS-150', short: 'On MCS-150' },
];

export const VEHICLE_ITEMS: readonly ItemSlot[] = [
  {
    key: 'dot_inspection',
    name: 'DOT Annual Inspection',
    short: 'DOT inspection',
    category: 'vehicle_inspection',
    cadenceMonths: 12,
    leadTimeDays: 30,
    dateLabel: 'Inspection date',
    upload: false,
  },
  {
    key: 'registration',
    name: 'Vehicle Registration',
    short: 'Registration',
    category: 'vehicle_registration',
    cadenceMonths: 12,
    leadTimeDays: 30,
    dateLabel: 'Registered on',
    upload: false,
  },
];

/**
 * Deliberately short intervals (Trent, 2026-10-13: "lean toward shorter").
 * Whichever clock fires first makes it due. PM is every other oil change, so the
 * two land on the same shop visit. Editable per truck on its page.
 */
export const VEHICLE_PM: readonly PmSlot[] = [
  {
    key: 'pm',
    short: 'Preventative maint.',
    label: 'Preventative Maintenance',
    serviceType: 'pm_b',
    intervalMiles: 8000,
    intervalDays: 182,
  },
  {
    key: 'oil',
    short: 'Oil change',
    label: 'Oil Change',
    serviceType: 'oil_change',
    intervalMiles: 4000,
    intervalDays: 91,
  },
];

// ── Drivers ──────────────────────────────────────────────────────────────────

export const DRIVER_ITEMS: readonly ItemSlot[] = [
  {
    key: 'driver_application',
    name: 'Driver Application',
    short: 'Application',
    category: 'driver_qualification',
    cadenceMonths: null,
    leadTimeDays: 30,
    dateLabel: null,
    upload: true,
  },
  {
    key: 'medical_card',
    name: 'DOT Medical Card',
    short: 'Medical card',
    category: 'driver_qualification',
    // The longest a DOT medical certificate is issued for. Examiners often issue
    // shorter — the expiration printed on the card is what gets entered.
    cadenceMonths: 24,
    leadTimeDays: 45,
    dateLabel: null,
    upload: true,
  },
  {
    key: 'driver_test',
    name: 'Driver Road Test',
    short: 'Driver test',
    category: 'driver_qualification',
    cadenceMonths: null,
    leadTimeDays: 30,
    dateLabel: null,
    upload: true,
  },
];

export const DRIVER_CHECKS: readonly CheckSlot[] = [
  { key: 'insurance_approved', label: 'Approved by the insurance carrier', short: 'Insurance approved' },
];

export const VEHICLE_CHECK_KEYS = new Set(VEHICLE_CHECKS.map((c) => c.key));
export const DRIVER_CHECK_KEYS = new Set(DRIVER_CHECKS.map((c) => c.key));

export function findItemSlot(entity: 'vehicle' | 'employee', key: string): ItemSlot | undefined {
  return (entity === 'vehicle' ? VEHICLE_ITEMS : DRIVER_ITEMS).find((s) => s.key === key);
}

// ── Grid row shapes ──────────────────────────────────────────────────────────

export interface SlotCheck {
  checked: boolean;
  checked_on: string | null;
  checked_by_name: string | null;
}

export interface SlotItem {
  id: string;
  issue_date: string | null;
  expiration_date: string | null;
  state: PmState;
  days_until: number | null;
  files: ComplianceAttachment[];
}

export interface SlotPm {
  id: string;
  last_service_date: string | null;
  last_service_odometer: number | null;
  next_due_date: string | null;
  next_due_odometer: number | null;
  interval_miles: number | null;
  interval_days: number | null;
  state: PmState;
  days_until: number | null;
  miles_remaining: number | null;
}

export interface FleetChecklistRow {
  vehicle_id: string;
  name: string;
  current_odometer: number | null;
  odometer_updated_on: string | null;
  checks: Record<string, SlotCheck>;
  items: Record<string, SlotItem>;
  pm: Record<string, SlotPm>;
}

export interface DriverChecklistRow {
  employee_id: string;
  name: string;
  hire_date: string | null;
  checks: Record<string, SlotCheck>;
  items: Record<string, SlotItem>;
}
