import { query } from '@/lib/db';

// Ported verbatim from the live materials app (gg-materials-management) so the
// hub's Materials tab matches it exactly. Same tables; `jobs` → `materials_jobs`.

export interface InvMaterial { id: number; name: string; par: number }
export interface InvWarehouseCell {
  warehouseId: number;
  name: string;
  on_hand: number;
  low_level: number;
  low: boolean;
}
export interface InvTruckCell { truckId: number; name: string; on_hand: number }
export interface InventoryRow {
  material: InvMaterial;
  warehouses: InvWarehouseCell[];
  trucks: InvTruckCell[];
  total: number;
  low: boolean;
}
export interface InvEquipment {
  id: number;
  name: string;
  par: number;
  total_on_hand: number;
}
export interface StaleOpenJob {
  id: number;
  job_date: string;
  truck_name: string;
  sequence_no: number;
  status: string;
  customer: string | null;
}

// Live inventory: per material -> each warehouse (with its Low Level), each
// (active) truck, and total. A material is "low" if ANY warehouse is at/below
// its Low Level.
export async function getInventory(): Promise<InventoryRow[]> {
  const [materials, trucks, warehouses, wh, ts] = await Promise.all([
    query<{ id: number; name: string; par: number }>(
      'SELECT id, name, par FROM materials WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ id: number; name: string }>(
      'SELECT id, name FROM trucks WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ id: number; name: string }>(
      'SELECT id, name FROM warehouses WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ warehouse_id: number; material_id: number; on_hand: number; low_level: number }>(
      'SELECT warehouse_id, material_id, on_hand::float8 AS on_hand, low_level FROM warehouse_stock'
    ),
    query<{ truck_id: number; material_id: number; on_hand: number }>(
      'SELECT truck_id, material_id, on_hand::float8 AS on_hand FROM truck_stock'
    ),
  ]);

  const whBy = new Map<number, Map<number, { on_hand: number; low_level: number }>>();
  for (const r of wh) {
    if (!whBy.has(r.material_id)) whBy.set(r.material_id, new Map());
    whBy.get(r.material_id)!.set(r.warehouse_id, { on_hand: Number(r.on_hand), low_level: Number(r.low_level) });
  }
  const truckBy = new Map<number, Map<number, number>>();
  for (const r of ts) {
    if (!truckBy.has(r.material_id)) truckBy.set(r.material_id, new Map());
    truckBy.get(r.material_id)!.set(r.truck_id, Number(r.on_hand));
  }

  return materials.map((m) => {
    const perWarehouse = warehouses.map((w) => {
      const cell = whBy.get(m.id)?.get(w.id);
      const on_hand = cell?.on_hand ?? 0;
      const low_level = cell?.low_level ?? 0;
      return { warehouseId: w.id, name: w.name, on_hand, low_level, low: low_level > 0 && on_hand <= low_level };
    });
    const perTruck = trucks.map((t) => ({ truckId: t.id, name: t.name, on_hand: truckBy.get(m.id)?.get(t.id) ?? 0 }));
    const total =
      perWarehouse.reduce((s, w) => s + w.on_hand, 0) + perTruck.reduce((s, t) => s + t.on_hand, 0);
    const low = perWarehouse.some((w) => w.low);
    return { material: { id: m.id, name: m.name, par: Number(m.par) }, warehouses: perWarehouse, trucks: perTruck, total, low };
  });
}

export async function getEquipmentList(): Promise<InvEquipment[]> {
  return query<InvEquipment>(
    'SELECT id, name, par, total_on_hand FROM equipment WHERE active = TRUE ORDER BY sort_order, name'
  );
}

export async function getStaleOpenJobs(today: string): Promise<StaleOpenJob[]> {
  return query<StaleOpenJob>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date,
            t.name AS truck_name, j.sequence_no, j.status, j.customer
       FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id
      WHERE j.status <> 'complete' AND j.job_date < $1
      ORDER BY j.job_date ASC, t.name`,
    [today]
  );
}

// ── History tab ───────────────────────────────────────────────
export interface HistoryRow {
  id: number;
  job_date: string;
  truck_name: string;
  sequence_no: number;
  customer: string | null;
  status: string;
  total_used: number;
}

export async function getHistory(limit = 100): Promise<HistoryRow[]> {
  return query<HistoryRow>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date, t.name AS truck_name,
            j.sequence_no, j.customer, j.status,
            COALESCE(SUM(c.used), 0)::float8 AS total_used
       FROM materials_jobs j
       JOIN trucks t ON t.id = j.truck_id
       LEFT JOIN job_counts c ON c.job_id = j.id
      GROUP BY j.id, t.name
      ORDER BY j.job_date DESC, t.name, j.sequence_no DESC
      LIMIT $1`,
    [limit]
  );
}

export interface AdjustmentHistRow {
  id: number;
  at: string;
  material_name: string;
  location: string;
  qty_delta: number;
  note: string | null;
  created_by: string | null;
}

export async function getAdjustments(limit = 200): Promise<AdjustmentHistRow[]> {
  return query<AdjustmentHistRow>(
    `SELECT tx.id, to_char(tx.created_at,'YYYY-MM-DD HH24:MI') AS at,
            m.name AS material_name,
            CASE WHEN tx.truck_id IS NOT NULL THEN t.name
                 WHEN tx.warehouse_id IS NOT NULL THEN wh.name
                 ELSE 'Warehouse' END AS location,
            tx.qty_delta::float8 AS qty_delta, tx.note, tx.created_by
       FROM inventory_transactions tx
       JOIN materials m ON m.id = tx.material_id
       LEFT JOIN trucks t ON t.id = tx.truck_id
       LEFT JOIN warehouses wh ON wh.id = tx.warehouse_id
      WHERE tx.type IN ('adjustment', 'adjust')
      ORDER BY tx.created_at DESC
      LIMIT $1`,
    [limit]
  );
}
