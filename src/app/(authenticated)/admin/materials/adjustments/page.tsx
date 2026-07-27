import { getInventory } from '@/lib/materials/live-inventory';
import { AdjustForm } from './adjust-form';

export const dynamic = 'force-dynamic';

export default async function AdjustPage() {
  const inv = await getInventory();
  const warehouses = inv[0]?.warehouses.map((w) => ({ id: w.warehouseId, name: w.name })) ?? [];
  const trucks = inv[0]?.trucks.map((t) => ({ id: t.truckId, name: t.name })) ?? [];
  const rows = inv.map((r) => ({
    id: r.material.id,
    name: r.material.name,
    wh: Object.fromEntries(r.warehouses.map((w) => [w.warehouseId, w.on_hand])) as Record<
      number,
      number
    >,
    tr: Object.fromEntries(r.trucks.map((t) => [t.truckId, t.on_hand])) as Record<number, number>,
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-navy-700">Adjust Counts</h1>
      <p className="mb-5 font-ui text-sm text-navy-500">
        Correct any warehouse or truck total after a physical recount. Changes are logged in History
        → Adjustments.
      </p>
      <AdjustForm warehouses={warehouses} trucks={trucks} rows={rows} />
    </div>
  );
}
