'use server';

import { revalidatePath } from 'next/cache';
import { query, withTransaction } from '@/lib/db';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';

// Admin editor actions ported from the live materials app. Adapted to the hub:
// back-office guard, hub `query()` returns rows directly (client.query in a
// transaction still returns { rows }). Revalidate the hub's materials routes.

export type ActionResult = { ok: boolean; message?: string };

async function assert() {
  const emp = await getCurrentEmployee();
  if (!emp || !isBackOffice(emp)) throw new Error('Back office access required');
  return emp;
}

function bump() {
  revalidatePath('/admin/materials/settings');
  revalidatePath('/admin/materials');
}

// ── Warehouses ────────────────────────────────────────────────
export async function createWarehouse(name: string): Promise<ActionResult> {
  await assert();
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO warehouses (name, sort_order)
         VALUES ($1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM warehouses))
         RETURNING id`,
        [name]
      );
      const id = rows[0].id;
      await client.query(
        `INSERT INTO warehouse_stock (warehouse_id, material_id)
         SELECT $1, id FROM materials ON CONFLICT DO NOTHING`,
        [id]
      );
    });
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'A warehouse with that name already exists.' };
    return { ok: false, message: 'Could not add warehouse.' };
  }
  bump();
  return { ok: true };
}

export async function renameWarehouse(id: number, name: string): Promise<ActionResult> {
  await assert();
  try {
    await query('UPDATE warehouses SET name=$2, updated_at=NOW() WHERE id=$1', [id, name]);
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'A warehouse with that name already exists.' };
    return { ok: false, message: 'Could not rename warehouse.' };
  }
  bump();
  return { ok: true };
}

export async function setWarehouseActive(id: number, active: boolean) {
  await assert();
  await query('UPDATE warehouses SET active=$2, updated_at=NOW() WHERE id=$1', [id, active]);
  bump();
}

// ── Trucks ────────────────────────────────────────────────────
export async function createTruck(name: string): Promise<ActionResult> {
  await assert();
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO trucks (name, sort_order, warehouse_id)
         VALUES ($1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM trucks),
                 (SELECT id FROM warehouses ORDER BY sort_order, id LIMIT 1))
         RETURNING id`,
        [name]
      );
      const id = rows[0].id;
      await client.query(
        `INSERT INTO truck_stock (truck_id, material_id)
         SELECT $1, id FROM materials ON CONFLICT DO NOTHING`,
        [id]
      );
    });
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'A truck with that name already exists.' };
    return { ok: false, message: 'Could not add truck.' };
  }
  bump();
  return { ok: true };
}

export async function renameTruck(id: number, name: string): Promise<ActionResult> {
  await assert();
  try {
    await query('UPDATE trucks SET name=$2, updated_at=NOW() WHERE id=$1', [id, name]);
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'A truck with that name already exists.' };
    return { ok: false, message: 'Could not rename truck.' };
  }
  bump();
  return { ok: true };
}

export async function setTruckActive(id: number, active: boolean) {
  await assert();
  await query('UPDATE trucks SET active=$2, updated_at=NOW() WHERE id=$1', [id, active]);
  bump();
}

export async function reorderTrucks(orderedIds: number[]) {
  await assert();
  await withTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query('UPDATE trucks SET sort_order=$2, updated_at=NOW() WHERE id=$1', [
        orderedIds[i],
        i + 1,
      ]);
    }
  });
  bump();
}

export async function setTruckWarehouse(id: number, warehouseId: number) {
  await assert();
  await query('UPDATE trucks SET warehouse_id=$2, updated_at=NOW() WHERE id=$1', [id, warehouseId]);
  bump();
}

// ── Materials ─────────────────────────────────────────────────
export type MaterialFields = { name: string; par: number; cost: number; charge: number };

export async function updateMaterial(id: number, fields: MaterialFields) {
  await assert();
  await query(
    `UPDATE materials
        SET name=$2, par=$3, cost_per_unit=$4, charge_per_unit=$5, updated_at=NOW()
      WHERE id=$1`,
    [id, fields.name, fields.par, fields.cost, fields.charge]
  );
  bump();
}

export async function createMaterial(name: string, par: number, cost = 0, charge = 0) {
  await assert();
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO materials (name, par, cost_per_unit, charge_per_unit, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order),0)+1 FROM materials))
       RETURNING id`,
      [name, par, cost, charge]
    );
    const id = rows[0].id;
    await client.query(
      `INSERT INTO warehouse_stock (warehouse_id, material_id)
       SELECT w.id, $1 FROM warehouses w ON CONFLICT DO NOTHING`,
      [id]
    );
    await client.query(
      `INSERT INTO truck_stock (truck_id, material_id)
       SELECT id, $1 FROM trucks ON CONFLICT DO NOTHING`,
      [id]
    );
  });
  bump();
}

export async function deleteMaterial(id: number) {
  await assert();
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT EXISTS(SELECT 1 FROM job_counts WHERE material_id=$1) AS used',
      [id]
    );
    if (rows[0].used) {
      await client.query('UPDATE materials SET active=FALSE, updated_at=NOW() WHERE id=$1', [id]);
    } else {
      await client.query('DELETE FROM inventory_transactions WHERE material_id=$1', [id]);
      await client.query('DELETE FROM materials WHERE id=$1', [id]); // cascades stock rows
    }
  });
  bump();
}

// ── Low Levels (per warehouse) ────────────────────────────────
export async function setWarehouseLowLevel(warehouseId: number, materialId: number, lowLevel: number) {
  await assert();
  await query(
    `INSERT INTO warehouse_stock (warehouse_id, material_id, low_level, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (warehouse_id, material_id) DO UPDATE SET low_level=$3, updated_at=NOW()`,
    [warehouseId, materialId, Math.max(0, Math.trunc(lowLevel))]
  );
  bump();
}

// ── Equipment ─────────────────────────────────────────────────
export async function createEquipment(name: string, par: number, total = 0): Promise<ActionResult> {
  await assert();
  try {
    await query(
      `INSERT INTO equipment (name, par, total_on_hand, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order),0)+1 FROM equipment))`,
      [name, Math.max(0, Math.trunc(par)), Math.max(0, Math.trunc(total))]
    );
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'That equipment name already exists.' };
    return { ok: false, message: 'Could not add equipment.' };
  }
  bump();
  return { ok: true };
}

export async function updateEquipment(
  id: number,
  fields: { name: string; par: number; total_on_hand: number }
): Promise<ActionResult> {
  await assert();
  try {
    await query('UPDATE equipment SET name=$2, par=$3, total_on_hand=$4, updated_at=NOW() WHERE id=$1', [
      id,
      fields.name.trim(),
      Math.max(0, Math.trunc(fields.par)),
      Math.max(0, Math.trunc(fields.total_on_hand)),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, message: 'That equipment name already exists.' };
    return { ok: false, message: 'Could not save.' };
  }
  bump();
  return { ok: true };
}

export async function deleteEquipment(id: number): Promise<ActionResult> {
  await assert();
  const rows = await query<{ used: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM job_equipment WHERE equipment_id=$1) AS used',
    [id]
  );
  if (rows[0]?.used) {
    await query('UPDATE equipment SET active=FALSE, updated_at=NOW() WHERE id=$1', [id]);
  } else {
    await query('DELETE FROM equipment WHERE id=$1', [id]);
  }
  bump();
  return { ok: true };
}

// ── Routines ──────────────────────────────────────────────────
export async function createRoutineItem(phase: 'morning' | 'close', label: string) {
  await assert();
  await query(
    `INSERT INTO routine_items (phase, label, sort_order)
     VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order),0)+1 FROM routine_items WHERE phase=$1))`,
    [phase, label]
  );
  bump();
}

export async function updateRoutineItem(id: number, label: string) {
  await assert();
  await query('UPDATE routine_items SET label=$2, updated_at=NOW() WHERE id=$1', [id, label]);
  bump();
}

export async function deleteRoutineItem(id: number) {
  await assert();
  await query('DELETE FROM routine_items WHERE id=$1', [id]);
  bump();
}
