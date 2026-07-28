'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRoutineItem, updateRoutineItem, deleteRoutineItem } from '@/lib/materials/admin-editor-actions';

type Item = { id: number; phase: 'morning' | 'close'; label: string };

export function RoutinesEditor({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [labels, setLabels] = useState<Record<number, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.label]))
  );
  const [adds, setAdds] = useState<Record<string, string>>({ morning: '', close: '' });

  useEffect(() => {
    setLabels((prev) => {
      const next = { ...prev };
      for (const i of items) if (!(i.id in next)) next[i.id] = i.label;
      return next;
    });
  }, [items]);

  const rename = (id: number) =>
    startTransition(async () => {
      if (!labels[id]?.trim()) return;
      await updateRoutineItem(id, labels[id].trim());
      router.refresh();
    });

  const remove = (id: number, label: string) => {
    if (!window.confirm(`Delete checklist item "${label}"?`)) return;
    startTransition(async () => {
      await deleteRoutineItem(id);
      router.refresh();
    });
  };

  const add = (phase: 'morning' | 'close') =>
    startTransition(async () => {
      const label = adds[phase].trim();
      if (!label) return;
      await createRoutineItem(phase, label);
      setAdds((a) => ({ ...a, [phase]: '' }));
      router.refresh();
    });

  const column = (phase: 'morning' | 'close', title: string) => {
    const list = items.filter((i) => i.phase === phase);
    return (
      <div className="gg-surface p-4">
        <h3 className="mb-2 font-display text-base font-bold text-navy-700">{title}</h3>
        <div className="space-y-2">
          {list.map((i) => (
            <div key={i.id} className="flex items-center gap-2">
              <input
                className="gg-input flex-1"
                value={labels[i.id] ?? ''}
                onChange={(e) => setLabels((p) => ({ ...p, [i.id]: e.target.value }))}
              />
              <button onClick={() => rename(i.id)} disabled={pending} className="gg-btn-sm">
                Save
              </button>
              <button
                onClick={() => remove(i.id, i.label)}
                disabled={pending}
                className="rounded-md border-2 border-red-500 px-2.5 py-1.5 font-ui text-sm font-semibold text-red-500 hover:bg-red-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
          {list.length === 0 && <p className="font-ui text-sm text-navy-300">No items yet.</p>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            className="gg-input flex-1"
            placeholder="New checklist item"
            value={adds[phase]}
            onChange={(e) => setAdds((a) => ({ ...a, [phase]: e.target.value }))}
          />
          <button
            onClick={() => add(phase)}
            disabled={pending || !adds[phase].trim()}
            className="gg-btn-primary px-4 py-2"
          >
            Add
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {column('morning', 'Morning Routine')}
      {column('close', 'Close Routine')}
    </div>
  );
}
