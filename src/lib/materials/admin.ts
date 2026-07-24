import { query } from '@/lib/db';

// Admin list queries for the materials config — include inactive rows (the
// admin editors toggle Active), ordered for a stable list.

export interface AdminRow {
  id: number;
  [key: string]: unknown;
}

export async function getAllWarehouses(): Promise<AdminRow[]> {
  return query<AdminRow>(
    'SELECT id, name, sort_order, active FROM warehouses ORDER BY sort_order, name'
  );
}

export async function getAllTrucks(): Promise<AdminRow[]> {
  return query<AdminRow>(
    'SELECT id, name, warehouse_id, sort_order, active FROM trucks ORDER BY sort_order, name'
  );
}

export async function getAllMaterials(): Promise<AdminRow[]> {
  return query<AdminRow>(
    `SELECT id, name, par, reorder_threshold, cost_per_unit, charge_per_unit,
            is_storage_pad, sort_order, active
       FROM materials ORDER BY sort_order, name`
  );
}

export async function getAllEquipment(): Promise<AdminRow[]> {
  return query<AdminRow>(
    `SELECT id, name, par, total_on_hand, is_storage_pad, sort_order, active
       FROM equipment ORDER BY sort_order, name`
  );
}

export async function getAllRoutines(): Promise<AdminRow[]> {
  return query<AdminRow>(
    'SELECT id, phase, label, sort_order, active FROM routine_items ORDER BY phase, sort_order'
  );
}

export async function getAllCrew(): Promise<AdminRow[]> {
  return query<AdminRow>(
    'SELECT id, name, sort_order, active FROM crew_members ORDER BY sort_order, name'
  );
}
