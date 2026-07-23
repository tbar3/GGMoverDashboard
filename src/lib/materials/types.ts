// Domain types for the materials module, ported from the standalone
// gg-materials-management app. Kept in one file so the crew and (later) admin
// surfaces share the same shapes.

export type Material = {
  id: number;
  name: string;
  par: number;
  reorder_threshold: number;
  sort_order: number;
  active: boolean;
  cost_per_unit: number;
  charge_per_unit: number;
};

export type RoutineItem = {
  id: number;
  phase: 'morning' | 'close';
  label: string;
  sort_order: number;
  active: boolean;
};

export type Truck = {
  id: number;
  name: string;
  active: boolean;
  warehouse_id: number | null; // home warehouse (loading pulls from here)
};

// Crew roster member — names populate the "Crew" picker on the count sheet.
export type CrewMember = {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
};

export type Warehouse = {
  id: number;
  name: string;
  active: boolean;
};

// Reusable equipment (hand trucks, dollies, etc.) — one company-wide
// total_on_hand, NOT tracked per warehouse/truck.
export type Equipment = {
  id: number;
  name: string;
  par: number;
  total_on_hand: number;
  active: boolean;
  is_storage_pad: boolean;
};

export type JobEquipmentRow = {
  equipment_id: number;
  name: string;
  par: number;
  is_storage_pad: boolean;
  dispatch_count: number | null;
  after_count: number | null;
};

export type JobStatus = 'draft' | 'dispatched' | 'complete';

export type Job = {
  id: number;
  job_date: string; // YYYY-MM-DD
  truck_id: number;
  truck_name: string;
  sequence_no: number;
  customer: string | null;
  job_number: string | null;
  crew_lead: string | null;
  crew: string | null;
  status: JobStatus;
  entered_in_smartmoving: boolean;
  is_storage_in: boolean;
  storage_pads_used: number | null;
  created_by: string | null;
  age_hours?: number; // hours since created_at (for the crew 24h window)
  morning_routine: Record<string, boolean>;
  close_routine: Record<string, boolean>;
};

// A count row on the job sheet, joined with its material.
export type JobCountRow = {
  material_id: number;
  name: string;
  par: number;
  sort_order: number;
  pre_dispatch: number | null;
  post_dispatch: number | null;
  post_job: number | null;
  used: number | null;
  charged: number | null;
};

// A recent-sheet row for the crew home (last 24h).
export type HistoryRow = {
  id: number;
  job_date: string;
  truck_id: number;
  truck_name: string;
  sequence_no: number;
  customer: string | null;
  job_number: string | null;
  crew_lead: string | null;
  crew: string | null;
  status: JobStatus;
  entered_in_smartmoving: boolean;
  morning_routine: Record<string, boolean>;
  close_routine: Record<string, boolean>;
  material_count: number;
  total_used: number;
};
