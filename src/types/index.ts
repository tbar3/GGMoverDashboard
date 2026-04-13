// User roles
export type UserRole = 'owner' | 'manager' | 'driver' | 'lead' | 'helper';

// Employee
export interface Employee {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  start_date: string;
  is_active: boolean;
  is_admin: boolean;
  hourly_rate: number | null;
  created_at: string;
}

// Payroll entry (one per employee per pay week)
export interface PayrollEntry {
  id: string;
  employee_id: string;
  week_start: string; // Monday
  week_end: string;   // Sunday
  pay_date: string;   // Friday of following week
  travel_hours: number;
  job_hours: number;
  warehouse_hours: number;
  total_hours: number;
  hourly_rate: number;
  gross_pay: number;
  lunch_reimbursement: number;
  mileage_reimbursement: number;
  other_reimbursement: number;
  tip: number;
  notes: string | null;
  created_at: string;
  // Joined fields
  employee_name?: string;
  employee_role?: string;
}

// Job
export interface Job {
  id: string;
  date: string;
  customer_name: string;
  pickup_address: string;
  dropoff_address: string;
  revenue: number | null;
  crew_ids: string[];
  // Calendar sync fields
  calendar_event_id: string | null;
  job_number: string | null;
  service_type: string | null;
  start_time: string | null;
  end_time: string | null;
  branch: string | null;
  job_details: string | null;
  pricing_type: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  lead_source: string | null;
  estimated_hours: number | null;
  volume_cuft: number | null;
  weight_lbs: number | null;
  arrival_window: string | null;
  property_type: string | null;
  dispatch_notes: string | null;
  internal_notes: string | null;
  crew_notes: string | null;
  customer_notes: string | null;
  quoted_trucks: number | null;
  quoted_crew: number | null;
  truck_name: string | null;
  crew_manifest: { name: string; phone: string }[];
  synced_at: string | null;
  created_at: string;
}

// Checklist completion
export interface ChecklistCompletion {
  id: string;
  job_id: string;
  employee_id: string;
  role: 'driver' | 'lead' | 'helper';
  items_completed: string[];
  completed_at: string;
  created_at: string;
}

// Attendance record
export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  arrival_time: string | null;
  is_tardy: boolean;
  in_uniform: boolean;
  notes: string | null;
  created_at: string;
}

// Perfect week record
export interface PerfectWeek {
  id: string;
  employee_id: string;
  week_start: string;
  week_end: string;
  achieved: boolean;
  created_at: string;
}

// Mileage entry
export interface MileageEntry {
  id: string;
  employee_id: string;
  job_id: string | null;
  date: string;
  miles: number;
  amount: number;
  created_at: string;
}

// Damage record
export interface Damage {
  id: string;
  job_id: string | null;
  employee_ids: string[];
  description: string;
  amount: number;
  was_reported: boolean;
  created_at: string;
}

// Performance event types
export type PerformanceEventType = 'five_star_review' | 'customer_callout' | 'crew_callout';

// Performance event
export interface PerformanceEvent {
  id: string;
  employee_id: string;
  type: PerformanceEventType;
  description: string | null;
  date: string;
  created_at: string;
}

// Monthly bonus calculation
export interface MonthlyBonus {
  id: string;
  month: number;
  year: number;
  total_revenue: number;
  pool_percentage: number;
  total_pool: number;
  damages_deducted: number;
  tenure_pool: number;
  performance_pool: number;
  calculated_at: string;
}

// Individual bonus payout
export interface BonusPayout {
  id: string;
  monthly_bonus_id: string;
  employee_id: string;
  tenure_shares: number;
  tenure_amount: number;
  performance_score: number;
  performance_amount: number;
  mileage_amount: number;
  perfect_week_hours: number;
  total_amount: number;
}

// Checklist item definition
export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

// Role-specific checklists
export const DRIVER_CHECKLIST: ChecklistItem[] = [
  { id: 'truck_clean', label: 'Truck clean from previous trip' },
  { id: 'truck_supplied', label: 'Truck supplied per Standard Supplies' },
  { id: 'trash_removed', label: 'Trash removed from truck' },
  { id: 'truck_swept', label: 'Back of truck swept/blown out' },
  { id: 'cab_cleaned', label: 'Cab cleaned (seats, dashboard, windshield, floors)' },
  { id: 'dot_inspection', label: 'DOT Pre-Trip inspection completed' },
  { id: 'courtesy_call', label: 'Courtesy call to customer when departing' },
  { id: 'spotter_used', label: 'Used spotter when backing at destination' },
];

export const LEAD_CHECKLIST: ChecklistItem[] = [
  { id: 'greeted_customer', label: 'Greeted customer with handshake' },
  { id: 'introduced_crew', label: 'Introduced all crew members' },
  { id: 'identified_contact', label: 'Identified self as primary contact' },
  { id: 'walkthrough_team', label: 'Performed walkthrough with full team' },
  { id: 'labeled_rooms', label: 'Labeled rooms with painter\'s tape' },
  { id: 'documented_damages', label: 'Documented pre-existing damages with photos' },
  { id: 'assigned_roles', label: 'Assigned roles to crew' },
  { id: 'final_walkthrough_pickup', label: 'Final walkthrough with customer at pickup' },
  { id: 'final_walkthrough_destination', label: 'Final walkthrough with customer at destination' },
  { id: 'provided_cards', label: 'Provided business cards' },
  { id: 'asked_review', label: 'Asked for review' },
  { id: 'completed_billing', label: 'Completed billing/invoice' },
];

export const HELPER_CHECKLIST: ChecklistItem[] = [
  { id: 'greeted_customer', label: 'Greeted customer with handshake' },
  { id: 'participated_walkthrough', label: 'Participated in walkthrough' },
  { id: 'pad_wrapped', label: 'Pad-wrapped all furniture (100% covered)' },
  { id: 'shrink_wrapped_light', label: 'Shrink-wrapped white/light furniture before padding' },
  { id: 'hardware_labeled', label: 'Labeled disassembly hardware in ziplock' },
  { id: 'fragile_labeled', label: 'Labeled fragile items' },
  { id: 'floor_protection', label: 'Installed floor protection & door jamb protectors' },
  { id: 'pads_folded', label: 'Folded pads on-site' },
  { id: 'final_check', label: 'Final walkthrough for items/trash/tools' },
  { id: 'thanked_customer', label: 'Thanked customer with handshake' },
];

// Configuration constants
export const CONFIG = {
  WAREHOUSE_ADDRESS: '1285 Collier Rd NW, Atlanta, GA 30318',
  MILEAGE_RATE: 0.60,
  TARDY_CUTOFF_HOUR: 7,
  TARDY_CUTOFF_MINUTE: 15,
  DEFAULT_POOL_PERCENTAGE: 4.5,
  UNREPORTED_DAMAGE_MULTIPLIER: 2,
} as const;

