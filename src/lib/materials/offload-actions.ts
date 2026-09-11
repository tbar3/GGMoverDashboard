'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { withTransaction } from '@/lib/db';
import { getCurrentEmployee } from '@/lib/auth';

// Offload: move materials OFF a truck and back into its home warehouse.
//
// Before this existed, material could get onto a truck but never come back —
// the only way to reduce a truck's count was to "use" it on a job, which
// inflated usage and never credited the warehouse. Crews offload at the start
// of the day (dropping what this truck won't need) or at the end (emptying it),
// so it deliberately has no job attached.

export type OffloadLine = { material_id: number; qty: number };
export type OffloadResult = { ok: boolean; error?: string; count?: number };

export async function offloadFromTruck(
  truckId: number,
  lines: OffloadLine[],
  note?: string | null
): Promise<OffloadResult> {
  // Same guard as the count sheet: the people on the truck do this themselves.
  const emp = await getCurrentEmployee();
  if (!emp || !emp.is_active) return { ok: false, error: 'Not authorized' };

  if (!Number.isInteger(truckId) || truckId <= 0) {
    return { ok: false, error: 'Pick a truck.' };
  }
  const clean = (lines ?? []).filter(
    (l) => l.material_id && Number.isFinite(l.qty) && l.qty > 0
  );
  if (clean.length === 0) {
    return { ok: false, error: 'Enter how many of at least one material you are taking off.' };
  }

  let error: string | null = null;
  await withTransaction(async (client) => {
    const { rows: tr } = await client.query(
      `SELECT id, name, warehouse_id FROM trucks WHERE id=$1 AND active = TRUE`,
      [truckId]
    );
    const truck = tr[0];
    if (!truck) {
      error = "That truck isn't available. Pick a truck from the list.";
      return;
    }
    if (truck.warehouse_id == null) {
      error = `Give "${truck.name}" a home warehouse in Admin before offloading from it.`;
      return;
    }

    const batchId = randomUUID();

    for (const l of clean) {
      const { rows: mr } = await client.query(`SELECT name FROM materials WHERE id=$1`, [
        l.material_id,
      ]);
      if (!mr[0]) {
        error = 'One of those materials no longer exists — reload the page.';
        return;
      }
      const { rows: sr } = await client.query(
        `SELECT on_hand FROM truck_stock WHERE truck_id=$1 AND material_id=$2 FOR UPDATE`,
        [truckId, l.material_id]
      );
      const onHand = Number(sr[0]?.on_hand ?? 0);
      // A truck cannot give back what it isn't carrying. Rejecting the whole
      // batch (rather than clamping) keeps the count honest: if the truck really
      // has more than the system thinks, that surfaces as variance on the next
      // count sheet, where it belongs.
      if (l.qty > onHand) {
        error = `${truck.name} only has ${onHand} ${mr[0].name} on board — you can't offload ${l.qty}.`;
        return;
      }

      await client.query(
        `UPDATE truck_stock SET on_hand = on_hand - $3, updated_at = NOW()
          WHERE truck_id = $1 AND material_id = $2`,
        [truckId, l.material_id, l.qty]
      );
      await client.query(
        `INSERT INTO warehouse_stock (warehouse_id, material_id, on_hand, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (warehouse_id, material_id)
           DO UPDATE SET on_hand = warehouse_stock.on_hand + $3, updated_at = NOW()`,
        [truck.warehouse_id, l.material_id, l.qty]
      );
      await client.query(
        `INSERT INTO inventory_transactions
           (material_id, truck_id, warehouse_id, type, qty_delta, note, created_by, batch_id)
         VALUES ($1, $2, $3, 'offload', $4, $5, $6, $7)`,
        [
          l.material_id,
          truckId,
          truck.warehouse_id,
          l.qty,
          note?.trim() || null,
          emp.name,
          batchId,
        ]
      );
    }
  });

  if (error) return { ok: false, error };

  revalidatePath('/materials');
  revalidatePath('/materials/offload');
  revalidatePath('/admin/materials');
  revalidatePath('/admin/materials/history');
  return { ok: true, count: clean.length };
}
