'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { offloadFromTruck } from '@/lib/materials/offload-actions';
import type { TruckOnHandRow } from '@/lib/materials/live-inventory';

// Half units are allowed throughout the materials module, so quantities round
// to 2dp rather than snapping to whole numbers.
const num = (s: string) => Math.round((Number(s) || 0) * 100) / 100;

export function OffloadForm({
  truckId,
  truckName,
  rows,
}: {
  truckId: number;
  truckName: string;
  rows: TruckOnHandRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carrying = rows.filter((r) => r.on_hand > 0);
  const set = (id: number, v: string) => setVals((p) => ({ ...p, [id]: v }));

  // End of day: empty the truck in one tap rather than typing every row.
  const offloadAll = () => {
    const next: Record<number, string> = {};
    for (const r of carrying) next[r.material_id] = String(r.on_hand);
    setVals(next);
  };

  const lines = () =>
    rows
      .map((r) => ({ material_id: r.material_id, qty: num(vals[r.material_id] ?? '') }))
      .filter((l) => l.qty > 0);

  const totalItems = lines().length;

  const submit = () => {
    const payload = lines();
    if (payload.length === 0) {
      setError('Enter how many of at least one material you are taking off.');
      setMessage(null);
      return;
    }
    const over = payload.find((l) => {
      const row = rows.find((r) => r.material_id === l.material_id);
      return row && l.qty > row.on_hand;
    });
    if (over) {
      const row = rows.find((r) => r.material_id === over.material_id)!;
      setError(`${truckName} only has ${row.on_hand} ${row.name} on board.`);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await offloadFromTruck(truckId, payload, note.trim() || null);
      if (res.ok) {
        setVals({});
        setNote('');
        setMessage(
          `Offloaded ${res.count} item${res.count === 1 ? '' : 's'} from ${truckName} back into the warehouse.`
        );
        router.refresh();
      } else {
        setError(res.error ?? 'Something went wrong saving — please try again.');
      }
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="gg-eyebrow mb-0.5">Step 2 · What&apos;s coming off</p>
          <h2 className="font-display text-lg font-bold tracking-tight text-navy-700">
            {truckName}
          </h2>
        </div>
        <div className="flex gap-2">
          <Link href="/materials/offload" className="gg-btn-ghost">
            Change truck
          </Link>
          <button type="button" onClick={offloadAll} className="gg-btn-ghost">
            Offload All
          </button>
        </div>
      </div>

      {carrying.length === 0 ? (
        <p className="rounded-lg border-2 border-navy-100 bg-cream-50 p-4 font-ui text-sm text-navy-600">
          {truckName} isn&apos;t carrying any materials right now — nothing to offload.
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign sm:block">
            <table className="w-full text-sm">
              <thead className="gg-thead text-left">
                <tr>
                  <th className="px-3 py-2.5">Material</th>
                  <th className="px-3 py-2.5 text-center">On Truck</th>
                  <th className="px-3 py-2.5 text-center">Taking Off</th>
                  <th className="px-3 py-2.5 text-center">Left on Truck</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-300 font-ui">
                {carrying.map((r) => {
                  const qty = num(vals[r.material_id] ?? '');
                  const left = r.on_hand - qty;
                  return (
                    <tr key={r.material_id}>
                      <td className="px-3 py-2.5 font-semibold text-navy-700">{r.name}</td>
                      <td className="px-3 py-2.5 text-center text-navy-600">{r.on_hand}</td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          inputMode="decimal"
                          className="gg-input-num"
                          placeholder="0"
                          value={vals[r.material_id] ?? ''}
                          onChange={(e) => set(r.material_id, e.target.value)}
                        />
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-semibold ${
                          left < 0 ? 'text-red-500' : 'text-navy-600'
                        }`}
                      >
                        {left}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 sm:hidden">
            {carrying.map((r) => {
              const qty = num(vals[r.material_id] ?? '');
              const left = r.on_hand - qty;
              return (
                <div
                  key={r.material_id}
                  className="rounded-xl border-2 border-navy-100 bg-cream-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-ui text-sm font-bold text-navy-700">{r.name}</p>
                      <p className="font-ui text-xs text-navy-400">
                        On truck: {r.on_hand} · Left: {' '}
                        <span className={left < 0 ? 'font-bold text-red-500' : ''}>{left}</span>
                      </p>
                    </div>
                    <input
                      inputMode="decimal"
                      className="gg-input-num"
                      placeholder="0"
                      value={vals[r.material_id] ?? ''}
                      onChange={(e) => set(r.material_id, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="gg-eyebrow mb-1 block">Note (optional)</span>
            <input
              className="gg-input w-full"
              placeholder="e.g. end of day, not needed for tomorrow"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && (
            <p className="mt-3 rounded-lg border-2 border-warning bg-warning/10 p-3 font-ui text-sm font-semibold text-navy-700">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-3 rounded-lg border-2 border-success bg-success/10 p-3 font-ui text-sm font-semibold text-navy-700">
              {message}
            </p>
          )}

          <button onClick={submit} disabled={pending} className="gg-btn-cta mt-4">
            {pending
              ? 'Offloading…'
              : `Offload ${totalItems > 0 ? `${totalItems} Item${totalItems === 1 ? '' : 's'}` : ''}`.trim()}
          </button>
        </>
      )}
    </div>
  );
}
