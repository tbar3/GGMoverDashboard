import { getInventory } from '@/lib/materials/live-inventory';
import { ReceiveForm } from './receive-form';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  const inv = await getInventory();
  const warehouses =
    inv[0]?.warehouses.map((w) => ({ id: w.warehouseId, name: w.name })) ?? [];
  const rows = inv.map((r) => ({
    id: r.material.id,
    name: r.material.name,
    byWarehouse: Object.fromEntries(r.warehouses.map((w) => [w.warehouseId, w.on_hand])) as Record<
      number,
      number
    >,
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-navy-700">Receive Stock</h1>
      <p className="mb-5 font-ui text-sm text-navy-500">
        Add delivered supplies to a warehouse. Each entry is logged.
      </p>
      <ReceiveForm warehouses={warehouses} rows={rows} />
    </div>
  );
}
