'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWarehouseLowLevel } from '@/lib/materials/admin-editor-actions';

type Warehouse = { id: number; name: string };
type Row = { id: number; name: string; low: Record<number, number> };

export function LowLevelEditor({ warehouses, rows }: { warehouses: Warehouse[]; rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const build = () => {
    const v: Record<number, Record<number, string>> = {};
    for (const r of rows) {
      v[r.id] = {};
      for (const w of warehouses) v[r.id][w.id] = String(r.low[w.id] ?? 0);
    }
    return v;
  };
  const [vals, setVals] = useState(build);
  useEffect(() => {
    setVals(build());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const set = (matId: number, wid: number, v: string) =>
    setVals((prev) => ({ ...prev, [matId]: { ...prev[matId], [wid]: v } }));

  const save = () => {
    const initial = build();
    const changes: { wid: number; mat: number; val: number }[] = [];
    for (const r of rows)
      for (const w of warehouses) {
        const cur = vals[r.id]?.[w.id] ?? '';
        if (cur !== initial[r.id][w.id] && cur.trim() !== '')
          changes.push({ wid: w.id, mat: r.id, val: Math.trunc(Number(cur)) });
      }
    if (changes.length === 0) {
      setMsg('No changes to save.');
      return;
    }
    setMsg(null);
    startTransition(async () => {
      for (const c of changes) await setWarehouseLowLevel(c.wid, c.mat, c.val);
      setMsg(`Saved ${changes.length} Low Level(s).`);
      router.refresh();
    });
  };

  return (
    <div>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300 font-ui">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2.5 font-semibold text-navy-700">{r.name}</td>
                {warehouses.map((w) => (
                  <td key={w.id} className="px-2 py-2.5 text-center">
                    <input
                      inputMode="numeric"
                      className="gg-input-num"
                      value={vals[r.id]?.[w.id] ?? ''}
                      onChange={(e) => set(r.id, w.id, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="mt-3 font-ui text-sm font-semibold text-navy-600">{msg}</p>}
      <button onClick={save} disabled={pending} className="gg-btn-primary mt-4">
        {pending ? 'Saving…' : 'Save Low Levels'}
      </button>
    </div>
  );
}
