import {
  getAllWarehouses,
  getAllTrucks,
  getAllMaterials,
  getAllEquipment,
  getAllRoutines,
} from '@/lib/materials/admin';
import { EntitySection } from '../entity-section';

export const dynamic = 'force-dynamic';

export default async function MaterialsSettingsPage() {
  const [warehouses, trucks, materials, equipment, routines] = await Promise.all([
    getAllWarehouses(),
    getAllTrucks(),
    getAllMaterials(),
    getAllEquipment(),
    getAllRoutines(),
  ]);

  const warehouseOptions = warehouses.map((w) => ({
    value: String(w.id),
    label: String(w.name),
  }));

  return (
    <div className="space-y-6">
      <EntitySection
        table="warehouses"
        title="Warehouses"
        description="Where trucks load from."
        items={warehouses}
        fields={[{ key: 'name', label: 'Warehouse name', type: 'text' }]}
      />

      <EntitySection
        table="trucks"
        title="Trucks"
        description="Your fleet. Assign each a home warehouse — that's where its loading pulls stock from. (Also powers the dashboard's rental-trucks alert.)"
        items={trucks}
        fields={[
          { key: 'name', label: 'Truck name', type: 'text' },
          { key: 'warehouse_id', label: 'Warehouse', type: 'select', options: warehouseOptions },
        ]}
      />

      <EntitySection
        table="materials"
        title="Materials"
        description="The supply catalog. Par is the target stock; cost/charge are for reporting."
        items={materials}
        fields={[
          { key: 'name', label: 'Material', type: 'text' },
          { key: 'par', label: 'Par', type: 'num', placeholder: 'Par' },
          { key: 'reorder_threshold', label: 'Reorder ≤', type: 'int', placeholder: 'Reorder' },
          { key: 'cost_per_unit', label: 'Cost $', type: 'num', placeholder: 'Cost' },
          { key: 'charge_per_unit', label: 'Charge $', type: 'num', placeholder: 'Charge' },
          { key: 'is_storage_pad', label: 'Storage pad', type: 'bool' },
        ]}
      />

      <EntitySection
        table="equipment"
        title="Equipment"
        description="Reusable gear (hand trucks, dollies). One company-wide on-hand count."
        items={equipment}
        fields={[
          { key: 'name', label: 'Equipment', type: 'text' },
          { key: 'par', label: 'Par', type: 'int', placeholder: 'Par' },
          { key: 'total_on_hand', label: 'On hand', type: 'int', placeholder: 'On hand' },
          { key: 'is_storage_pad', label: 'Furniture pad', type: 'bool' },
        ]}
      />

      <EntitySection
        table="routine_items"
        title="Routine Checklist"
        description="Morning and close checklist items shown on the count sheet."
        items={routines}
        fields={[
          {
            key: 'phase',
            label: 'Phase',
            type: 'select',
            options: [
              { value: 'morning', label: 'Morning' },
              { value: 'close', label: 'Close' },
            ],
            width: '9rem',
          },
          { key: 'label', label: 'Item', type: 'text', width: '20rem' },
        ]}
      />
    </div>
  );
}
