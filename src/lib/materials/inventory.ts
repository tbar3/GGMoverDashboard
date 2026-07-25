import { query } from '@/lib/db';

// Inventory reads for the Materials admin tabs (History, Reporting). Writes live in
// inventory-actions.ts. Everything runs off inventory_transactions (the ledger) and
// the warehouse_stock / truck_stock on-hand tables.

export interface TxnRow {
  id: number;
  created_at: string;
  type: string;
  material: string;
  qty_delta: number;
  location: string | null;
  note: string | null;
  created_by: string | null;
}

export async function getTransactions(limit = 200): Promise<TxnRow[]> {
  return query<TxnRow>(
    `SELECT t.id, t.created_at::text AS created_at, t.type, m.name AS material,
            t.qty_delta::float8 AS qty_delta,
            COALESCE(w.name, tr.name) AS location, t.note, t.created_by
       FROM inventory_transactions t
       JOIN materials m ON m.id = t.material_id
       LEFT JOIN warehouses w ON w.id = t.warehouse_id
       LEFT JOIN trucks tr ON tr.id = t.truck_id
      ORDER BY t.created_at DESC
      LIMIT $1`,
    [limit]
  );
}

export interface StockRow {
  material: string;
  location: string;
  onHand: number;
  reorder: number | null;
  low: boolean;
}

async function stock(table: 'warehouse_stock' | 'truck_stock', locCol: string, locTable: string): Promise<StockRow[]> {
  const rows = await query<{ material: string; location: string; on_hand: number; reorder: number | null }>(
    `SELECT m.name AS material, l.name AS location, s.on_hand::float8 AS on_hand,
            m.reorder_threshold AS reorder
       FROM ${table} s
       JOIN materials m ON m.id = s.material_id
       JOIN ${locTable} l ON l.id = s.${locCol}
      ORDER BY l.name, m.name`
  );
  return rows.map((r) => ({
    material: r.material,
    location: r.location,
    onHand: Number(r.on_hand),
    reorder: r.reorder,
    low: r.reorder != null && Number(r.on_hand) <= Number(r.reorder),
  }));
}

export function getWarehouseStock(): Promise<StockRow[]> {
  return stock('warehouse_stock', 'warehouse_id', 'warehouses');
}
export function getTruckStock(): Promise<StockRow[]> {
  return stock('truck_stock', 'truck_id', 'trucks');
}

// ── On-hand matrix (the Inventory landing) ────────────────────

export interface OnHandRow {
  material: string;
  par: number | null;
  warehouse: number;
  trucks: number[]; // aligned to truckNames
  total: number;
  low: boolean;
}
export interface OnHandView {
  truckNames: string[];
  rows: OnHandRow[];
}

/**
 * Each material's on-hand at the warehouse (warehouse_stock) and on each truck
 * (the latest completed count sheet's Post-Job for that truck), totalled across
 * all locations. Low = total below par × number of trucks (fully-stock-every-truck).
 */
export async function getOnHandMatrix(): Promise<OnHandView> {
  const [trucks, materials, wh, truckStock] = await Promise.all([
    query<{ id: number; name: string }>(
      'SELECT id, name FROM trucks WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ id: number; name: string; par: number | null }>(
      'SELECT id, name, par FROM materials WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ material_id: number; on_hand: number }>(
      'SELECT material_id, SUM(on_hand)::float8 AS on_hand FROM warehouse_stock GROUP BY material_id'
    ),
    query<{ truck_id: number; material_id: number; qty: number }>(
      `WITH latest AS (
         SELECT DISTINCT ON (truck_id) id, truck_id
           FROM materials_jobs WHERE status = 'complete'
          ORDER BY truck_id, job_date DESC, sequence_no DESC
       )
       SELECT l.truck_id, jc.material_id, jc.post_job::float8 AS qty
         FROM latest l JOIN job_counts jc ON jc.job_id = l.id
        WHERE jc.post_job IS NOT NULL`
    ),
  ]);

  const whMap = new Map(wh.map((r) => [r.material_id, Number(r.on_hand)]));
  const tsMap = new Map<string, number>();
  for (const r of truckStock) tsMap.set(`${r.truck_id}-${r.material_id}`, Number(r.qty));

  const truckCount = trucks.length;
  const rows: OnHandRow[] = materials.map((m) => {
    const warehouse = whMap.get(m.id) ?? 0;
    const truckQtys = trucks.map((t) => tsMap.get(`${t.id}-${m.id}`) ?? 0);
    const total = warehouse + truckQtys.reduce((s, q) => s + q, 0);
    const target = (Number(m.par) || 0) * truckCount;
    return { material: m.name, par: m.par, warehouse, trucks: truckQtys, total, low: target > 0 && total < target };
  });

  return { truckNames: trucks.map((t) => t.name), rows };
}

export interface UnclosedSheet {
  id: number;
  label: string;
}
/** Count sheets opened on an earlier day and never completed. */
export async function getUnclosedSheets(): Promise<UnclosedSheet[]> {
  const rows = await query<{ id: number; truck: string; sequence_no: number; job_date: string; customer: string | null }>(
    `SELECT mj.id, t.name AS truck, mj.sequence_no, mj.job_date::text AS job_date, mj.customer
       FROM materials_jobs mj JOIN trucks t ON t.id = mj.truck_id
      WHERE mj.status <> 'complete' AND mj.job_date < CURRENT_DATE
      ORDER BY mj.job_date`
  );
  return rows.map((r) => ({
    id: r.id,
    label: `${r.truck} · Job #${r.sequence_no} · ${r.job_date}${r.customer ? ` · ${r.customer}` : ''}`,
  }));
}
