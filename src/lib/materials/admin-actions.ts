'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

// Generic CRUD for the materials config tables. Table names and column names
// come only from this whitelist (never raw client input), so interpolating them
// is safe; all values are parameterized. Back office only.

type FieldType = 'text' | 'int' | 'num' | 'bool';

const ENTITIES: Record<string, Record<string, FieldType>> = {
  warehouses: { name: 'text', active: 'bool' },
  trucks: { name: 'text', warehouse_id: 'int', active: 'bool' },
  materials: {
    name: 'text',
    par: 'num',
    reorder_threshold: 'int',
    cost_per_unit: 'num',
    charge_per_unit: 'num',
    is_storage_pad: 'bool',
    active: 'bool',
  },
  equipment: {
    name: 'text',
    par: 'int',
    total_on_hand: 'int',
    is_storage_pad: 'bool',
    active: 'bool',
  },
  routine_items: { phase: 'text', label: 'text', active: 'bool' },
  crew_members: { name: 'text', active: 'bool' },
};

function coerce(type: FieldType, v: unknown): string | number | boolean | null {
  if (type === 'bool') return Boolean(v);
  if (type === 'int') {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }
  if (type === 'num') {
    const s = String(v ?? '')
      .replace(/[$,]/g, '')
      .trim();
    if (s === '') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

// Validate + coerce a value bag against an entity's whitelist.
function prepare(table: string, values: Record<string, unknown>): { cols: string[]; vals: unknown[] } | null {
  const spec = ENTITIES[table];
  if (!spec) return null;
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, type] of Object.entries(spec)) {
    if (k in values) {
      cols.push(k);
      vals.push(coerce(type, values[k]));
    }
  }
  return { cols, vals };
}

type Result = { ok: boolean; error?: string };

export async function createEntity(table: string, values: Record<string, unknown>): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const p = prepare(table, values);
  if (!p || p.cols.length === 0) return { ok: false, error: 'Nothing to save' };

  const placeholders = p.cols.map((_, i) => `$${i + 1}`).join(', ');
  try {
    await query(`INSERT INTO ${table} (${p.cols.join(', ')}) VALUES (${placeholders})`, p.vals);
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
  revalidatePath('/admin/materials');
  return { ok: true };
}

export async function updateEntity(
  table: string,
  id: number,
  values: Record<string, unknown>
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const p = prepare(table, values);
  if (!p || p.cols.length === 0) return { ok: false, error: 'Nothing to save' };

  const sets = p.cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    await query(`UPDATE ${table} SET ${sets} WHERE id = $1`, [id, ...p.vals]);
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
  revalidatePath('/admin/materials');
  return { ok: true };
}

export async function deleteEntity(table: string, id: number): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!(table in ENTITIES)) return { ok: false, error: 'Unknown item' };
  try {
    await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  } catch (e) {
    return { ok: false, error: dbError(e) };
  }
  revalidatePath('/admin/materials');
  return { ok: true };
}

function dbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : 'Something went wrong';
  if (msg.includes('duplicate key')) return 'That name is already taken';
  if (msg.includes('violates foreign key')) return 'Still in use — remove references first';
  if (msg.includes('not-null')) return 'A required field is missing';
  return msg;
}
