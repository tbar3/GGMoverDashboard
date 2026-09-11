/**
 * Compliance domain types.
 *
 * Two words are kept deliberately distinct throughout this module:
 *   status — the STORED lifecycle of an obligation (active / archived / n/a)
 *   state  — the DERIVED urgency of it (expired / due_soon / ok / no_expiry)
 * They are different questions, and conflating them is the likeliest bug here.
 */

export const COMPLIANCE_CATEGORIES = [
  { value: 'vehicle_registration', label: 'Vehicle Registration' },
  { value: 'vehicle_inspection', label: 'Vehicle Inspection' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'operating_authority', label: 'Operating Authority' },
  { value: 'state_filing', label: 'State Filing' },
  { value: 'permit_license', label: 'Permit / License' },
  { value: 'tax_filing', label: 'Tax Filing' },
  { value: 'driver_qualification', label: 'Driver Qualification' },
  { value: 'safety_program', label: 'Safety Program' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'other', label: 'Other' },
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number]['value'];

export const ENTITY_TYPES = [
  { value: 'company', label: 'Company' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'employee', label: 'Employee' },
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number]['value'];

export const ITEM_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'not_applicable', label: 'Not applicable' },
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number]['value'];

/** Derived urgency. Never stored — see status.ts. */
export type ComplianceState = 'expired' | 'due_soon' | 'ok' | 'no_expiry';

/** PM adds a fifth: a schedule with no baseline service yet. */
export type PmState = ComplianceState | 'unknown';

/**
 * Common renewal cadences, as months. A number rather than an enum of words:
 * 'biennial' is exactly the word the next person retypes as 'bi-annual', which
 * means the opposite.
 */
export const CADENCE_OPTIONS = [
  { value: '', label: 'One-time / as needed' },
  { value: '1', label: 'Monthly' },
  { value: '3', label: 'Quarterly' },
  { value: '6', label: 'Every 6 months' },
  { value: '12', label: 'Annually' },
  { value: '24', label: 'Every 2 years (biennial)' },
  { value: '36', label: 'Every 3 years' },
] as const;

export interface ComplianceItem {
  id: string;
  name: string;
  category: ComplianceCategory;
  entity_type: EntityType;
  vehicle_id: string | null;
  entity_employee_id: string | null;
  issuing_authority: string | null;
  identifier: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  cadence_months: number | null;
  lead_time_days: number;
  cost: number | null;
  owner_employee_id: string | null;
  status: ItemStatus;
  external_url: string | null;
  notes: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

/** An item as the lists render it: joined labels plus the derived state. */
export interface ComplianceItemRow extends ComplianceItem {
  state: ComplianceState;
  days_until: number | null;
  vehicle_name: string | null;
  entity_employee_name: string | null;
  owner_name: string | null;
  attachment_count: number;
}

export interface ComplianceRenewal {
  id: string;
  item_id: string;
  issue_date: string | null;
  expiration_date: string | null;
  completed_on: string;
  cost: number | null;
  confirmation_number: string | null;
  notes: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  created_at: string;
}

export const VEHICLE_TYPES = [
  { value: 'box_truck', label: 'Box Truck' },
  { value: 'tractor', label: 'Tractor' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'van', label: 'Van' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'other', label: 'Other' },
] as const;

export const OWNERSHIP_TYPES = [
  { value: 'owned', label: 'Owned' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented' },
] as const;

export interface Vehicle {
  id: string;
  name: string;
  truck_id: number | null;
  vehicle_type: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  plate_state: string;
  gvwr_lbs: number | null;
  is_cmv: boolean;
  ownership: string;
  current_odometer: number | null;
  odometer_updated_on: string | null;
  motive_vehicle_id: string | null;
  in_service_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleRow extends Vehicle {
  /** Worst state across this vehicle's compliance items and PM schedules. */
  worst_state: PmState;
  open_count: number;
}

export const PM_SERVICE_TYPES = [
  { value: 'oil_change', label: 'Oil Change' },
  { value: 'tire_rotation', label: 'Tire Rotation' },
  { value: 'tires_replace', label: 'Tire Replacement' },
  { value: 'brake_inspection', label: 'Brake Inspection' },
  { value: 'dot_annual_inspection', label: 'DOT Annual Inspection' },
  { value: 'transmission', label: 'Transmission Service' },
  { value: 'coolant', label: 'Coolant Service' },
  { value: 'air_filter', label: 'Air Filter' },
  { value: 'liftgate_service', label: 'Liftgate Service' },
  { value: 'pm_a', label: 'PM-A (light)' },
  { value: 'pm_b', label: 'PM-B (full)' },
  { value: 'other', label: 'Other' },
] as const;

export interface PmSchedule {
  id: string;
  vehicle_id: string;
  service_type: string;
  custom_label: string | null;
  interval_miles: number | null;
  interval_days: number | null;
  last_service_date: string | null;
  last_service_odometer: number | null;
  next_due_date: string | null;
  next_due_odometer: number | null;
  lead_time_days: number;
  lead_miles: number;
  active: boolean;
  notes: string | null;
}

export interface PmScheduleRow extends PmSchedule {
  state: PmState;
  vehicle_name: string;
  current_odometer: number | null;
  miles_remaining: number | null;
  days_until: number | null;
}

export interface ServiceLogEntry {
  id: string;
  vehicle_id: string;
  pm_schedule_id: string | null;
  service_type: string;
  description: string | null;
  service_date: string;
  odometer: number | null;
  vendor: string | null;
  invoice_number: string | null;
  cost: number | null;
  performed_by: string | null;
  performed_by_name: string | null;
  logged_by_name: string | null;
  notes: string | null;
}

export interface OdometerReading {
  id: string;
  vehicle_id: string;
  reading_date: string;
  odometer: number;
  source: string;
  note: string | null;
  recorded_by_name: string | null;
}

/** A file attached to an item, renewal, service entry, or vehicle. */
export interface ComplianceAttachment {
  id: string;
  document_id: string;
  title: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by_name: string;
  created_at: string;
}

export function categoryLabel(value: string): string {
  return COMPLIANCE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function serviceTypeLabel(value: string, custom?: string | null): string {
  if (value === 'other' && custom) return custom;
  return PM_SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}
