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
