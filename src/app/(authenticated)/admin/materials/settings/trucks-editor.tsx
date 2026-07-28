'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTruck,
  renameTruck,
  setTruckActive,
  reorderTrucks,
  setTruckWarehouse,
} from '@/lib/materials/admin-editor-actions';

type Row = { id: number; name: string; active: boolean; warehouse_id: number | null };
type Warehouse = { id: number; name: string };

export function TrucksEditor({ rows, warehouses }: { rows: Row[]; warehouses: Warehouse[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState<Row[]>(rows);
  const [names, setNames] = useState<Record<number, string>>(
    Object.fromEntries(rows.map((r) => [r.id, r.name]))
  );
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  useEffect(() => {
    setList(rows);
    setNames(Object.fromEntries(rows.map((r) => [r.id, r.name])));
  }, [rows]);

  const rename = (id: number) =>
    startTransition(async () => {
      setMsg(null);
      if (!names[id]?.trim()) return;
      const r = await renameTruck(id, names[id].trim());
      if (!r.ok) setMsg(r.message ?? 'Could not rename truck.');
      router.refresh();
    });

  const toggle = (id: number, active: boolean) =>
    startTransition(async () => {
      setMsg(null);
      await setTruckActive(id, active);
      router.refresh();
    });

  const add = () =>
    startTransition(async () => {
      setMsg(null);
      if (!newName.trim()) return;
      const r = await createTruck(newName.trim());
      if (!r.ok) {
        setMsg(r.message ?? 'Could not add truck.');
        return;
      }
      setNewName('');
      router.refresh();
    });

  const setHome = (id: number, warehouseId: number) =>
    startTransition(async () => {
      await setTruckWarehouse(id, warehouseId);
      router.refresh();
    });

  const onDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault();
    if (dragId === null || dragId === overId) return;
    setList((prev) => {
      const from = prev.findIndex((t) => t.id === dragId);
      const to = prev.findIndex((t) => t.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const persistOrder = () => {
    const ids = list.map((t) => t.id);
    setDragId(null);
    startTransition(async () => {
      await reorderTrucks(ids);
      router.refresh();
    });
  };

  return (
    <div>
      <p className="mb-2 font-ui text-xs text-navy-400">
        Drag the <span className="font-bold">⠿</span> handle to reorder trucks.
      </p>
      <div className="space-y-2">
        {list.map((r) => (
          <div
            key={r.id}
            onDragOver={(e) => onDragOver(e, r.id)}
            onDrop={persistOrder}
            className={`gg-surface flex flex-wrap items-center gap-2 p-3 ${
              dragId === r.id ? 'opacity-50' : ''
            }`}
          >
            <span
              draggable
              onDragStart={() => setDragId(r.id)}
              onDragEnd={persistOrder}
              title="Drag to reorder"
              className="cursor-grab select-none px-1 text-lg text-navy-300 active:cursor-grabbing"
            >
              ⠿
            </span>
            <input
              className="gg-input flex-1"
              value={names[r.id] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
            />
            <button onClick={() => rename(r.id)} disabled={pending} className="gg-btn-sm">
              Rename
            </button>
            {warehouses.length > 1 && (
              <select
                className="gg-input py-1.5"
                value={r.warehouse_id ?? ''}
                disabled={pending}
                onChange={(e) => setHome(r.id, Number(e.target.value))}
                title="Home warehouse"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
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
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">Add a truck</h3>
        <div className="flex flex-wrap items-end gap-3">
          <input
            className="gg-input"
            placeholder="e.g. Truck 3"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button onClick={add} disabled={pending || !newName.trim()} className="gg-btn-primary">
            Add Truck
          </button>
        </div>
      </div>
    </div>
  );
}
