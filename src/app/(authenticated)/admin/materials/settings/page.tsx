import { query } from '@/lib/db';
import { getInventory } from '@/lib/materials/live-inventory';
import { WarehousesEditor } from './warehouses-editor';
import Link from 'next/link';
import { MaterialsEditor } from './materials-editor';
import { LowLevelEditor } from './low-level-editor';
import { EquipmentEditor } from './equipment-editor';
import { RoutinesEditor } from './routines-editor';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [materials, trucks, routines, warehouses, inv, equipment] = await Promise.all([
    query<{ id: number; name: string; par: number; cost_per_unit: number; charge_per_unit: number }>(
      'SELECT id, name, par, cost_per_unit, charge_per_unit FROM materials WHERE active = TRUE ORDER BY sort_order, name'
    ),
    // Read-only here: trucks are managed in Fleet, which keeps the materials truck
    // and its fleet record in step. Returned rentals are history, not trucks.
    query<{ id: number; name: string; warehouse: string | null; rented: boolean }>(
      `SELECT t.id, t.name, w.name AS warehouse,
              COALESCE(v.ownership = 'rented', FALSE) AS rented
         FROM trucks t
         LEFT JOIN warehouses w ON w.id = t.warehouse_id
         LEFT JOIN vehicles v ON v.truck_id = t.id
        WHERE t.active = TRUE
        ORDER BY t.sort_order, t.name`
    ),
    query<{ id: number; phase: 'morning' | 'close'; label: string }>(
      "SELECT id, phase, label FROM routine_items WHERE active = TRUE ORDER BY phase, sort_order, id"
    ),
    query<{ id: number; name: string; active: boolean }>(
      'SELECT id, name, active FROM warehouses ORDER BY sort_order, name'
    ),
    getInventory(),
    query<{ id: number; name: string; par: number; total_on_hand: number }>(
      'SELECT id, name, par, total_on_hand FROM equipment WHERE active = TRUE ORDER BY sort_order, name'
    ),
  ]);

  const warehouseOpts = warehouses.filter((w) => w.active).map((w) => ({ id: w.id, name: w.name }));

  const lowRows = inv.map((r) => ({
    id: r.material.id,
    name: r.material.name,
    low: Object.fromEntries(r.warehouses.map((w) => [w.warehouseId, w.low_level])) as Record<
      number,
      number
    >,
  }));

  return (
    <div className="space-y-10">
      <div>
        <p className="gg-eyebrow mb-1">Admin</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-navy-700">Manage</h1>
        <p className="mt-1 font-ui text-sm text-navy-500">
          Warehouses, trucks, materials, low levels, routines, and equipment.
        </p>
      </div>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Warehouses</h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          Add a warehouse, rename it, or retire it. Each warehouse holds its own stock and Low
          Levels. Assign each truck a home warehouse below.
        </p>
        <WarehousesEditor rows={warehouses.map((w) => ({ id: w.id, name: w.name, active: w.active }))} />
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Trucks</h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          Trucks on the count sheets, in the order crews see them. Add, rename, retire, reorder,
          or change a truck&apos;s home warehouse in{' '}
          <Link href="/admin/fleet" className="font-semibold underline">
            Fleet
          </Link>{' '}
          — one place for its materials, compliance and calendar names. Rentals come and go from
          the{' '}
          <Link href="/admin/rentals" className="font-semibold underline">
            Rental Trucks board
          </Link>
          .
        </p>
        <ul className="space-y-2">
          {trucks.map((t) => (
            <li key={t.id} className="gg-surface flex flex-wrap items-center gap-2 p-3 font-ui text-sm">
              <span className="font-semibold text-navy-700">{t.name}</span>
              {t.rented && (
                <span className="rounded bg-cream-200 px-1.5 py-0.5 text-xs text-navy-500">
                  rental
                </span>
              )}
              <span className="flex-1" />
              <span className="text-navy-400">{t.warehouse ?? 'No warehouse'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">
          Materials, Par, Cost &amp; Charge
        </h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          Par is the standard top-up amount. Cost/Charge drive the money reports. Low Levels are set
          per warehouse below.
        </p>
        <MaterialsEditor
          rows={materials.map((m) => ({
            id: m.id,
            name: m.name,
            par: Number(m.par),
            cost_per_unit: Number(m.cost_per_unit),
            charge_per_unit: Number(m.charge_per_unit),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Low Levels (per warehouse)</h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          The reorder point for each material at each warehouse. Alerts fire when a warehouse drops
          within 20%, 10%, 5%, then at/below its Low Level. Set 0 to disable alerts for that material
          at that warehouse.
        </p>
        <LowLevelEditor warehouses={warehouseOpts} rows={lowRows} />
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Equipment</h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          Reusable gear (hand trucks, floor runners, etc.) — not sold, not tracked per truck. Set the
          Par (per truck) and the total you own. It appears as a checklist on the job sheet; crews
          count it at dispatch and after the job, and get a warning if anything&apos;s missing.
        </p>
        <EquipmentEditor
          rows={equipment.map((e) => ({
            id: e.id,
            name: e.name,
            par: Number(e.par),
            total_on_hand: Number(e.total_on_hand),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl font-bold text-navy-700">Routines &amp; Checklists</h2>
        <p className="mb-3 font-ui text-sm text-navy-500">
          These morning and close checklist items appear on every job count sheet. Add, rename, or
          remove them here.
        </p>
        <RoutinesEditor items={routines.map((r) => ({ id: r.id, phase: r.phase, label: r.label }))} />
      </section>
    </div>
  );
}
