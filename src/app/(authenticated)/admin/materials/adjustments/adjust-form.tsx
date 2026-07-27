'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyAdjustments } from '@/lib/materials/inventory-actions';

type Warehouse = { id: number; name: string };
type Truck = { id: number; name: string };
type Row = {
  id: number;
  name: string;
  wh: Record<number, number>; // warehouseId -> on_hand
  tr: Record<number, number>; // truckId -> on_hand
};

const wKey = (id: number) => `w${id}`;
const tKey = (id: number) => `t${id}`;

export function AdjustForm({
  warehouses,
  trucks,
  rows,
}: {
  warehouses: Warehouse[];
  trucks: Truck[];
  rows: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const build = () => {
    const v: Record<number, Record<string, string>> = {};
    for (const r of rows) {
      v[r.id] = {};
      for (const w of warehouses) v[r.id][wKey(w.id)] = String(r.wh[w.id] ?? 0);
      for (const t of trucks) v[r.id][tKey(t.id)] = String(r.tr[t.id] ?? 0);
    }
    return v;
  };
  const [vals, setVals] = useState(build);
  useEffect(() => {
    setVals(build());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const set = (matId: number, key: string, v: string) =>
    setVals((prev) => ({ ...prev, [matId]: { ...prev[matId], [key]: v } }));

  const submit = () => {
    type Change = {
      materialId: number;
      location: { warehouse: number } | { truck: number };
      newValue: number;
    };
    const initial = build();
    const changes: Change[] = [];
    for (const r of rows) {
      for (const w of warehouses) {
        const k = wKey(w.id);
        if (vals[r.id][k] !== initial[r.id][k] && vals[r.id][k].trim() !== '')
          changes.push({
            materialId: r.id,
            location: { warehouse: w.id },
            newValue: Math.round(Number(vals[r.id][k]) * 100) / 100, // allow half units
          });
      }
      for (const t of trucks) {
        const k = tKey(t.id);
        if (vals[r.id][k] !== initial[r.id][k] && vals[r.id][k].trim() !== '')
          changes.push({
            materialId: r.id,
            location: { truck: t.id },
            newValue: Math.round(Number(vals[r.id][k]) * 100) / 100, // allow half units
          });
      }
    }
    if (changes.length === 0) {
      setMessage('No changes to save.');
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await applyAdjustments(changes, note.trim() || null);
      if (res.ok) {
        setNote('');
        setMessage(`Saved ${res.count} adjustment(s) — view them in History → Adjustments.`);
        router.refresh();
      } else {
        setMessage(res.error ?? 'Something went wrong saving — please try again.');
      }
    });
  };

  return (
    <div>
      <label className="mb-3 block">
        <span className="gg-eyebrow mb-1 block">Reason / note (optional)</span>
        <input
          className="gg-input w-full"
          placeholder="e.g. recount, damaged, found on shelf"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign">
        <table className="w-full text-sm">
          <thead className="gg-thead text-left">
            <tr>
              <th className="px-3 py-2.5">Item</th>
              {warehouses.map((w) => (
                <th key={w.id} className="px-2 py-2.5 text-center">
                  {w.name}
                </th>
              ))}
              {trucks.map((t) => (
                <th key={t.id} className="px-2 py-2.5 text-center">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300 font-ui">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2.5 font-semibold text-navy-700">{r.name}</td>
                {warehouses.map((w) => (
                  <td key={w.id} className="px-2 py-2.5 text-center">
                    <input
                      inputMode="decimal"
                      className="gg-input-num"
                      value={vals[r.id]?.[wKey(w.id)] ?? ''}
                      onChange={(e) => set(r.id, wKey(w.id), e.target.value)}
                    />
                  </td>
                ))}
                {trucks.map((t) => (
                  <td key={t.id} className="px-2 py-2.5 text-center">
                    <input
                      inputMode="decimal"
                      className="gg-input-num"
                      value={vals[r.id]?.[tKey(t.id)] ?? ''}
                      onChange={(e) => set(r.id, tKey(t.id), e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <p className="mt-3 font-ui text-sm font-semibold text-navy-600">{message}</p>
      )}

      <button onClick={submit} disabled={pending} className="gg-btn-primary mt-4">
        {pending ? 'Saving…' : 'Save Adjustments'}
      </button>
    </div>
  );
}
