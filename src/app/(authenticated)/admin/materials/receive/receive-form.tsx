'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { receiveStockBatch } from '@/lib/materials/inventory-actions';

type Warehouse = { id: number; name: string };
type Row = { id: number; name: string; byWarehouse: Record<number, number> };

export function ReceiveForm({ warehouses, rows }: { warehouses: Warehouse[]; rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [wid, setWid] = useState<number>(warehouses[0]?.id ?? 0);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const current = (matId: number) => rows.find((r) => r.id === matId)?.byWarehouse[wid] ?? 0;

  const submit = () => {
    const entries = rows
      .map((r) => ({
        material_id: r.id,
        qty: Math.round(Number(qty[r.id] || 0) * 100) / 100, // allow half units
      }))
      .filter((e) => e.qty !== 0);
    if (entries.length === 0) {
      setMessage('Enter a quantity for at least one item.');
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await receiveStockBatch(wid, entries, note.trim() || null);
      if (res.ok) {
        setQty({});
        setNote('');
        setMessage(`Received stock for ${res.count} item(s).`);
        router.refresh();
      } else {
        setMessage(res.error ?? 'Something went wrong — please try again.');
      }
    });
  };

  return (
    <div>
      <div className="gg-surface mb-3 flex flex-wrap items-end gap-3 p-3">
        <label className="block">
          <span className="gg-eyebrow mb-1 block">Receive into</span>
          <select className="gg-input" value={wid} onChange={(e) => setWid(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1">
          <span className="gg-eyebrow mb-1 block">Note (optional)</span>
          <input
            className="gg-input w-full"
            placeholder="e.g. Uline delivery"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
        <table className="w-full text-sm">
          <thead className="gg-thead text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 text-left">Item</th>
              <th className="px-3 py-2.5 text-right">In Warehouse</th>
              <th className="px-3 py-2.5 text-center">Add Qty</th>
              <th className="px-3 py-2.5 text-right">New Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300 font-ui">
            {rows.map((r) => {
              const add = Math.round(Number(qty[r.id] || 0) * 100) / 100;
              const cur = current(r.id);
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 font-semibold text-navy-700">{r.name}</td>
                  <td className="px-3 py-2.5 text-right text-navy-500">{cur}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      inputMode="decimal"
                      className="gg-input-num w-20"
                      value={qty[r.id] ?? ''}
                      onChange={(e) => setQty((q) => ({ ...q, [r.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-navy-700">
                    {add ? cur + add : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && (
        <p className="mt-3 font-ui text-sm font-semibold text-navy-600">{message}</p>
      )}

      <button onClick={submit} disabled={pending} className="gg-btn-cta mt-4">
        {pending ? 'Saving…' : 'Receive Into Warehouse'}
      </button>
    </div>
  );
}
