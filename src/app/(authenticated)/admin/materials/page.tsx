import {
  getAllWarehouses,
  getAllTrucks,
  getAllMaterials,
  getAllEquipment,
  getAllRoutines,
  getAllCrew,
} from '@/lib/materials/admin';
import { EntitySection } from './entity-section';

export const dynamic = 'force-dynamic';

export default async function MaterialsAdminPage() {
  const [warehouses, trucks, materials, equipment, routines, crew] = await Promise.all([
    getAllWarehouses(),
    getAllTrucks(),
    getAllMaterials(),
    getAllEquipment(),
    getAllRoutines(),
    getAllCrew(),
  ]);

  const warehouseOptions = warehouses.map((w) => ({
    value: String(w.id),
    label: String(w.name),
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Materials Settings</h1>
        <p className="text-muted-foreground mt-1">
          Set up trucks, warehouses, materials, equipment, routines, and the crew roster. Turn
          something Active off to hide it without losing history.
        </p>
      </div>

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

      <EntitySection
        table="crew_members"
        title="Crew Roster"
        description="Names that appear in the crew picker on the count sheet."
        items={crew}
        fields={[{ key: 'name', label: 'Crew member', type: 'text' }]}
      />
    </div>
  );
}
