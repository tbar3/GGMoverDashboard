import { query } from '@/lib/db';
import { getTransactions } from '@/lib/materials/inventory';
import { ReceiveForm } from './receive-form';
import { TxnList } from '../txn-list';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  const [materials, warehouses, txns] = await Promise.all([
    query<{ id: number; name: string }>('SELECT id, name FROM materials WHERE active = TRUE ORDER BY sort_order, name'),
    query<{ id: number; name: string }>('SELECT id, name FROM warehouses WHERE active = TRUE ORDER BY name'),
    getTransactions(15),
  ]);
  const receives = txns.filter((t) => t.type === 'receive');

  return (
    <div className="space-y-6">
      <ReceiveForm materials={materials} warehouses={warehouses} />
      <TxnList title="Recent receipts" rows={receives} />
    </div>
  );
}
