'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateMaterial, createMaterial, deleteMaterial } from '@/lib/materials/admin-editor-actions';

type Row = { id: number; name: string; par: number; cost_per_unit: number; charge_per_unit: number };
type Draft = { name: string; par: string; cost: string; charge: string };

function toDraft(r: Row): Draft {
  return { name: r.name, par: String(r.par), cost: String(r.cost_per_unit), charge: String(r.charge_per_unit) };
}

export function MaterialsEditor({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<number, Draft>>(
    Object.fromEntries(rows.map((r) => [r.id, toDraft(r)]))
  );
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    setVals((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!(r.id in next)) next[r.id] = toDraft(r);
      return next;
    });
  }, [rows]);

  const [newM, setNewM] = useState({ name: '', par: '', cost: '', charge: '' });

  const set = (id: number, k: keyof Draft, v: string) =>
    setVals((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));

  const n = (s: string) => Math.max(0, Math.round((Number(s) || 0) * 100) / 100);

  const save = (id: number) => {
    setSavedId(null);
    startTransition(async () => {
      const d = vals[id];
      await updateMaterial(id, { name: d.name.trim(), par: n(d.par), cost: n(d.cost), charge: n(d.charge) });
      setSavedId(id);
      router.refresh();
    });
  };

  const remove = (id: number, name: string) => {
    if (
      !window.confirm(
        `Delete "${name}"? If it's been used on jobs it will be archived (hidden) to keep history; otherwise it's removed.`
      )
    )
      return;
    startTransition(async () => {
      await deleteMaterial(id);
      router.refresh();
    });
  };

  const add = () => {
    if (!newM.name.trim()) return;
    startTransition(async () => {
      await createMaterial(newM.name.trim(), n(newM.par), n(newM.cost), n(newM.charge));
      setNewM({ name: '', par: '', cost: '', charge: '' });
      router.refresh();
    });
  };

  return (
    <div>
      <div className="space-y-2">
        {rows.map((r) => {
          const d = vals[r.id];
          if (!d) return null;
          return (
            <div key={r.id} className="gg-surface p-3">
              <input
                className="gg-input mb-2 w-full font-semibold"
                value={d.name}
                onChange={(e) => set(r.id, 'name', e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Cell label="Par">
                  <input inputMode="decimal" className="gg-input w-full" value={d.par} onChange={(e) => set(r.id, 'par', e.target.value)} />
                </Cell>
                <Cell label="Cost $/unit">
                  <input inputMode="decimal" className="gg-input w-full" value={d.cost} onChange={(e) => set(r.id, 'cost', e.target.value)} />
                </Cell>
                <Cell label="Charge $/unit">
                  <input inputMode="decimal" className="gg-input w-full" value={d.charge} onChange={(e) => set(r.id, 'charge', e.target.value)} />
                </Cell>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => save(r.id)} disabled={pending} className="gg-btn-sm">
                  {savedId === r.id ? 'Saved ✓' : 'Save'}
                </button>
                <button
                  onClick={() => remove(r.id, r.name)}
                  disabled={pending}
                  className="rounded-md border-2 border-red-500 px-3 py-1.5 font-ui text-sm font-semibold text-red-500 hover:bg-red-100 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="gg-card mt-5 p-4">
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">Add a material</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="Name">
            <input className="gg-input w-full" value={newM.name} onChange={(e) => setNewM({ ...newM, name: e.target.value })} />
          </Cell>
          <Cell label="Par">
            <input inputMode="decimal" className="gg-input w-full" value={newM.par} onChange={(e) => setNewM({ ...newM, par: e.target.value })} />
          </Cell>
          <Cell label="Cost $/unit">
            <input inputMode="decimal" className="gg-input w-full" value={newM.cost} onChange={(e) => setNewM({ ...newM, cost: e.target.value })} />
          </Cell>
          <Cell label="Charge $/unit">
            <input inputMode="decimal" className="gg-input w-full" value={newM.charge} onChange={(e) => setNewM({ ...newM, charge: e.target.value })} />
          </Cell>
        </div>
        <button onClick={add} disabled={pending || !newM.name.trim()} className="gg-btn-primary mt-3">
          Add Material
        </button>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="gg-eyebrow mb-1 block">{label}</span>
      {children}
    </label>
  );
}
