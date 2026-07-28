'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEquipment, updateEquipment, deleteEquipment } from '@/lib/materials/admin-editor-actions';

type Row = { id: number; name: string; par: number; total_on_hand: number };
type Draft = { name: string; par: string; total: string };

const toDraft = (r: Row): Draft => ({ name: r.name, par: String(r.par), total: String(r.total_on_hand) });

export function EquipmentEditor({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<number, Draft>>(
    Object.fromEntries(rows.map((r) => [r.id, toDraft(r)]))
  );
  const [savedId, setSavedId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newE, setNewE] = useState({ name: '', par: '', total: '' });

  useEffect(() => {
    setVals((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!(r.id in next)) next[r.id] = toDraft(r);
      return next;
    });
  }, [rows]);

  const n = (s: string) => Math.max(0, Math.trunc(Number(s) || 0));
  const set = (id: number, k: keyof Draft, v: string) =>
    setVals((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));

  const save = (id: number) => {
    setSavedId(null);
    setMsg(null);
    startTransition(async () => {
      const d = vals[id];
      const r = await updateEquipment(id, { name: d.name.trim(), par: n(d.par), total_on_hand: n(d.total) });
      if (!r.ok) setMsg(r.message ?? 'Could not save.');
      else setSavedId(id);
      router.refresh();
    });
  };

  const remove = (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    startTransition(async () => {
      await deleteEquipment(id);
      router.refresh();
    });
  };

  const add = () => {
    if (!newE.name.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await createEquipment(newE.name.trim(), n(newE.par), n(newE.total));
      if (!r.ok) {
        setMsg(r.message ?? 'Could not add.');
        return;
      }
      setNewE({ name: '', par: '', total: '' });
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
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="gg-eyebrow mb-1 block">Par (per truck)</span>
                  <input inputMode="numeric" className="gg-input w-full" value={d.par} onChange={(e) => set(r.id, 'par', e.target.value)} />
                </label>
                <label className="block">
                  <span className="gg-eyebrow mb-1 block">Total on hand</span>
                  <input inputMode="numeric" className="gg-input w-full" value={d.total} onChange={(e) => set(r.id, 'total', e.target.value)} />
                </label>
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

      {msg && <p className="mt-3 font-ui text-sm font-semibold text-red-500">{msg}</p>}

      <div className="gg-surface mt-5 p-4">
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">Add equipment</h3>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="gg-eyebrow mb-1 block">Name</span>
            <input className="gg-input w-full" value={newE.name} onChange={(e) => setNewE({ ...newE, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="gg-eyebrow mb-1 block">Par</span>
            <input inputMode="numeric" className="gg-input w-full" value={newE.par} onChange={(e) => setNewE({ ...newE, par: e.target.value })} />
          </label>
          <label className="block">
            <span className="gg-eyebrow mb-1 block">Total on hand</span>
            <input inputMode="numeric" className="gg-input w-full" value={newE.total} onChange={(e) => setNewE({ ...newE, total: e.target.value })} />
          </label>
        </div>
        <button onClick={add} disabled={pending || !newE.name.trim()} className="gg-btn-primary mt-3">
          Add Equipment
        </button>
      </div>
    </div>
  );
}
