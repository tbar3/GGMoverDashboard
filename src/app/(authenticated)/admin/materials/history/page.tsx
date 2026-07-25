import { getTransactions } from '@/lib/materials/inventory';
import { TxnList } from '../txn-list';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const txns = await getTransactions(300);
  return (
    <div className="space-y-6">
      <TxnList title="Inventory movement history" rows={txns} />
    </div>
  );
}
