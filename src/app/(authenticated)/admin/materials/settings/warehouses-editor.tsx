'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWarehouse, renameWarehouse, setWarehouseActive } from '@/lib/materials/admin-editor-actions';

type Row = { id: number; name: string; active: boolean };

export function WarehousesEditor({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [names, setNames] = useState<Record<number, string>>(
    Object.fromEntries(rows.map((r) => [r.id, r.name]))
  );
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setNames((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!(r.id in next)) next[r.id] = r.name;
      return next;
    });
  }, [rows]);

  const rename = (id: number) =>
    startTransition(async () => {
      setMsg(null);
      if (!names[id]?.trim()) return;
      const r = await renameWarehouse(id, names[id].trim());
      if (!r.ok) setMsg(r.message ?? 'Could not rename.');
      router.refresh();
    });

  const toggle = (id: number, active: boolean) =>
    startTransition(async () => {
      await setWarehouseActive(id, active);
      router.refresh();
    });

  const add = () =>
    startTransition(async () => {
      setMsg(null);
      if (!newName.trim()) return;
      const r = await createWarehouse(newName.trim());
      if (!r.ok) {
        setMsg(r.message ?? 'Could not add warehouse.');
        return;
      }
      setNewName('');
      router.refresh();
    });

  return (
    <div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="gg-surface flex flex-wrap items-center gap-2 p-3">
            <input
              className="gg-input flex-1"
              value={names[r.id] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
            />
            <button onClick={() => rename(r.id)} disabled={pending} className="gg-btn-sm">
              Rename
            </button>
            <button
              onClick={() => toggle(r.id, !r.active)}
              disabled={pending}
              className={`rounded-md px-3 py-1.5 font-ui text-sm font-semibold disabled:opacity-50 ${
                r.active
                  ? 'border-2 border-navy-200 bg-cream-50 text-navy-600 hover:bg-cream-200'
                  : 'bg-success text-cream-50 hover:opacity-90'
              }`}
            >
              {r.active ? 'Retire' : 'Reactivate'}
            </button>
            {!r.active && <span className="font-ui text-xs font-semibold text-navy-300">inactive</span>}
          </div>
        ))}
      </div>

      {msg && <p className="mt-3 font-ui text-sm font-semibold text-red-500">{msg}</p>}

      <div className="gg-surface mt-5 p-4">
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">Add a warehouse</h3>
        <div className="flex flex-wrap items-end gap-3">
          <input
            className="gg-input"
            placeholder="e.g. East Warehouse"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button onClick={add} disabled={pending || !newName.trim()} className="gg-btn-primary">
            Add Warehouse
          </button>
        </div>
      </div>
    </div>
  );
}
