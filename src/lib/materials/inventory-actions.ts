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
