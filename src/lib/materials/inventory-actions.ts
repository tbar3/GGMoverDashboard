'use server';

import { revalidatePath } from 'next/cache';
import { withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

function revalidateInventory() {
  for (const p of ['receive', 'adjustments', 'history', 'reporting']) {
    revalidatePath(`/admin/materials/${p}`);
  }
}

/** Receive new stock into a warehouse: a +delta transaction + on-hand bump. */
export async function receiveStock(input: {
  materialId: string;
  warehouseId: string;
  qty: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const materialId = parseInt(input.materialId, 10);
  const warehouseId = parseInt(input.warehouseId, 10);
  const qty = parseFloat(input.qty);
  if (!materialId || !warehouseId) return { ok: false, error: 'Pick a material and warehouse' };
  if (isNaN(qty) || qty <= 0) return { ok: false, error: 'Enter a positive quantity' };

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO inventory_transactions (material_id, warehouse_id, type, qty_delta, note, created_by)
       VALUES ($1, $2, 'receive', $3, $4, $5)`,
      [materialId, warehouseId, qty, input.note?.trim() || null, guard.employee.name]
    );
    await client.query(
      `INSERT INTO warehouse_stock (warehouse_id, material_id, on_hand) VALUES ($1, $2, $3)
       ON CONFLICT (warehouse_id, material_id)
         DO UPDATE SET on_hand = warehouse_stock.on_hand + $3, updated_at = NOW()`,
      [warehouseId, materialId, qty]
    );
  });
  revalidateInventory();
  return { ok: true };
}

/**
 * Receive delivered stock into a warehouse for many materials at once (the
 * live-app Receive screen). Each entry is a +delta on warehouse_stock plus a
 * 'receive' ledger row. Ported from the live materials app.
 */
export async function receiveStockBatch(
  warehouseId: number,
  entries: { material_id: number; qty: number }[],
  note: string | null
): Promise<Result & { count?: number }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
    return { ok: false, error: 'Pick a warehouse' };
  }
  const clean = (entries ?? []).filter((e) => e.material_id && Number.isFinite(e.qty) && e.qty !== 0);
  if (clean.length === 0) return { ok: false, error: 'Enter a quantity for at least one item' };

  await withTransaction(async (client) => {
    for (const e of clean) {
      await client.query(
        `INSERT INTO warehouse_stock (warehouse_id, material_id, on_hand, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (warehouse_id, material_id)
           DO UPDATE SET on_hand = warehouse_stock.on_hand + $3, updated_at = NOW()`,
        [warehouseId, e.material_id, e.qty]
      );
      await client.query(
        `INSERT INTO inventory_transactions (material_id, warehouse_id, type, qty_delta, note, created_by)
         VALUES ($1, $2, 'receive', $3, $4, $5)`,
        [e.material_id, warehouseId, e.qty, note, guard.employee.name]
      );
    }
  });
  revalidateInventory();
  return { ok: true, count: clean.length };
}

/** Manual stock adjustment (+/-) on a warehouse or truck, with a required reason. */
export async function adjustStock(input: {
  materialId: string;
  location: 'warehouse' | 'truck';
  locationId: string;
  qtyDelta: string;
  reason: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const materialId = parseInt(input.materialId, 10);
  const locationId = parseInt(input.locationId, 10);
  const delta = parseFloat(input.qtyDelta);
  if (!materialId || !locationId) return { ok: false, error: 'Pick a material and location' };
  if (isNaN(delta) || delta === 0) return { ok: false, error: 'Enter a non-zero amount' };
  if (!input.reason.trim()) return { ok: false, error: 'A reason is required' };

  const isWarehouse = input.location === 'warehouse';
  const locCol = isWarehouse ? 'warehouse_id' : 'truck_id';
  const stockTable = isWarehouse ? 'warehouse_stock' : 'truck_stock';

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO inventory_transactions (material_id, ${locCol}, type, qty_delta, note, created_by)
       VALUES ($1, $2, 'adjustment', $3, $4, $5)`,
      [materialId, locationId, delta, input.reason.trim(), guard.employee.name]
    );
    await client.query(
      `INSERT INTO ${stockTable} (${locCol}, material_id, on_hand) VALUES ($1, $2, $3)
       ON CONFLICT (${locCol}, material_id)
         DO UPDATE SET on_hand = ${stockTable}.on_hand + $3, updated_at = NOW()`,
      [locationId, materialId, delta]
    );
  });
  revalidateInventory();
  return { ok: true };
}

export type AdjustLocation = { warehouse: number } | { truck: number };
export interface AbsAdjust {
  materialId: number;
  location: AdjustLocation;
  newValue: number; // the corrected absolute on-hand
}

/**
 * Correct warehouse/truck totals to absolute new values after a physical recount
 * (the live-app Adjust grid). Each change sets the new on-hand and logs the delta
 * as an 'adjust' transaction. Ported from the live materials app.
 */
export async function applyAdjustments(
  changes: AbsAdjust[],
  note: string | null
): Promise<Result & { count?: number }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const clean = (changes ?? []).filter(
    (c) => c.materialId && Number.isFinite(c.newValue) && c.location
  );
  if (clean.length === 0) return { ok: false, error: 'No changes to save' };

  await withTransaction(async (client) => {
    for (const c of clean) {
      const isWarehouse = 'warehouse' in c.location;
      const locCol = isWarehouse ? 'warehouse_id' : 'truck_id';
      const stockTable = isWarehouse ? 'warehouse_stock' : 'truck_stock';
      const locId = isWarehouse
        ? (c.location as { warehouse: number }).warehouse
        : (c.location as { truck: number }).truck;

      const { rows } = await client.query(
        `SELECT on_hand FROM ${stockTable} WHERE ${locCol}=$1 AND material_id=$2 FOR UPDATE`,
        [locId, c.materialId]
      );
      const current = Number(rows[0]?.on_hand ?? 0);
      await client.query(
        `INSERT INTO ${stockTable} (${locCol}, material_id, on_hand, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (${locCol}, material_id) DO UPDATE SET on_hand=$3, updated_at=NOW()`,
        [locId, c.materialId, c.newValue]
      );
      await client.query(
        `INSERT INTO inventory_transactions (material_id, ${locCol}, type, qty_delta, note, created_by)
         VALUES ($1, $2, 'adjust', $3, $4, $5)`,
        [c.materialId, locId, c.newValue - current, note, guard.employee.name]
      );
    }
  });
  revalidateInventory();
  return { ok: true, count: clean.length };
}

export interface AdjustCell {
  materialId: number;
  location: 'warehouse' | 'truck';
  locationId: number;
  delta: number; // new value − current value
}

/**
 * Apply many on-hand corrections at once (the editable Adjustments grid). Each
 * changed cell becomes a ledger 'adjustment' row + a stock update, all in one
 * transaction with a shared reason.
 */
export async function adjustStockBatch(
  cells: AdjustCell[],
  reason: string
): Promise<Result & { count?: number }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!reason.trim()) return { ok: false, error: 'A reason is required' };

  const changes = (cells ?? []).filter(
    (c) => c.materialId && c.locationId && Number.isFinite(c.delta) && c.delta !== 0
  );
  if (changes.length === 0) return { ok: false, error: 'No changes to save' };

  await withTransaction(async (client) => {
    for (const c of changes) {
      const isWarehouse = c.location === 'warehouse';
      const locCol = isWarehouse ? 'warehouse_id' : 'truck_id';
      const stockTable = isWarehouse ? 'warehouse_stock' : 'truck_stock';
      await client.query(
        `INSERT INTO inventory_transactions (material_id, ${locCol}, type, qty_delta, note, created_by)
         VALUES ($1, $2, 'adjustment', $3, $4, $5)`,
        [c.materialId, c.locationId, c.delta, reason.trim(), guard.employee.name]
      );
      await client.query(
        `INSERT INTO ${stockTable} (${locCol}, material_id, on_hand) VALUES ($1, $2, $3)
         ON CONFLICT (${locCol}, material_id)
           DO UPDATE SET on_hand = ${stockTable}.on_hand + $3, updated_at = NOW()`,
        [c.locationId, c.materialId, c.delta]
      );
    }
  });
  revalidateInventory();
  return { ok: true, count: changes.length };
}
