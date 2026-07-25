import { query } from '@/lib/db';
import { getTransactions } from '@/lib/materials/inventory';
import { AdjustForm } from './adjust-form';
import { TxnList } from '../txn-list';

export const dynamic = 'force-dynamic';

export default async function AdjustmentsPage() {
  const [materials, warehouses, trucks, txns] = await Promise.all([
    query<{ id: number; name: string }>('SELECT id, name FROM materials WHERE active = TRUE ORDER BY sort_order, name'),
    query<{ id: number; name: string }>('SELECT id, name FROM warehouses WHERE active = TRUE ORDER BY name'),
    query<{ id: number; name: string }>('SELECT id, name FROM trucks WHERE active = TRUE ORDER BY sort_order, name'),
    getTransactions(15),
  ]);
  const adjustments = txns.filter((t) => t.type === 'adjustment');

  return (
    <div className="space-y-6">
      <AdjustForm materials={materials} warehouses={warehouses} trucks={trucks} />
      <TxnList title="Recent adjustments" rows={adjustments} />
    </div>
  );
}
