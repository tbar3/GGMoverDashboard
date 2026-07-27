import Link from 'next/link';
import { getInventory, getEquipmentList, getStaleOpenJobs } from '@/lib/materials/live-inventory';

export const dynamic = 'force-dynamic';

function today(): string {
  // Local date in YYYY-MM-DD (server timezone is fine for a single-warehouse app)
  return new Date().toLocaleDateString('en-CA');
}

export default async function MaterialsInventoryPage() {
  const [rows, equipment, staleJobs] = await Promise.all([
    getInventory(),
    getEquipmentList(),
    getStaleOpenJobs(today()),
  ]);
  const warehouses = rows[0]?.warehouses ?? [];
  const trucks = rows[0]?.trucks ?? [];
  const truckCount = trucks.length;
  // Equipment low level = par * number of trucks (fully stock every truck).
  const eqLow = (e: { par: number; total_on_hand: number }) =>
    e.par > 0 && e.total_on_hand < e.par * truckCount;
  const lowCount = rows.filter((r) => r.low).length + equipment.filter(eqLow).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="gg-eyebrow mb-1">Live Inventory</p>
          <h1 className="font-display text-3xl font-bold leading-none tracking-tight text-navy-700">
            On Hand
          </h1>
          <p className="mt-1 font-ui text-sm text-navy-500">
            Each warehouse + every truck = total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lowCount > 0 && (
            <span className="rounded-full bg-warning/15 px-3 py-1 font-ui text-sm font-semibold text-warning">
              {lowCount} low
            </span>
          )}
          <Link href="/admin/materials/new-job" className="gg-btn-cta">
            + New Job
          </Link>
        </div>
      </div>

      {/* Flag: count sheets from a previous day that were never closed out. */}
      {staleJobs.length > 0 && (
        <div className="mb-5 rounded-xl border-2 border-warning bg-warning/10 p-4">
          <p className="font-display font-bold text-navy-700">
            ⚠ {staleJobs.length} count sheet
            {staleJobs.length === 1 ? '' : 's'} not closed out
          </p>
          <p className="mt-0.5 font-ui text-sm text-navy-600">
            These were opened on an earlier day and never completed. Close them out so truck counts
            stay accurate. (You can still start today&apos;s jobs on these trucks.)
          </p>
          <ul className="mt-2 space-y-1">
            {staleJobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/materials/jobs/${j.id}`}
                  className="font-ui text-sm font-semibold text-navy-700 underline decoration-warning underline-offset-2 hover:text-navy-900"
                >
                  {j.truck_name} · Job #{j.sequence_no} · {j.job_date}
                  {j.customer ? ` · ${j.customer}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Desktop / tablet: full table */}
      <div className="hidden overflow-hidden rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="gg-thead text-left">
              <tr>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5 text-center">Par</th>
                {warehouses.map((w) => (
                  <th key={w.warehouseId} className="px-3 py-2.5 text-right">
                    {w.name}
                  </th>
                ))}
                {trucks.map((t) => (
                  <th key={t.truckId} className="px-3 py-2.5 text-right">
                    {t.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-300">
              {rows.map((r) => (
                <tr key={r.material.id} className={r.low ? 'bg-warning/10' : ''}>
                  <td className="px-3 py-2.5 font-semibold text-navy-700">
                    {r.material.name}
                    {r.low && (
                      <span className="ml-2 rounded bg-warning px-1.5 py-0.5 font-ui text-[10px] font-bold uppercase text-cream-50">
                        Low
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-ui text-navy-300">
                    {r.material.par}
                  </td>
                  {r.warehouses.map((w) => (
                    <td
                      key={w.warehouseId}
                      className={`px-3 py-2.5 text-right font-ui ${
                        w.low
                          ? 'font-bold text-warning'
                          : w.on_hand < 0
                          ? 'font-bold text-red-500'
                          : 'text-navy-600'
                      }`}
                    >
                      {w.on_hand}
                    </td>
                  ))}
                  {r.trucks.map((t) => (
                    <td key={t.truckId} className="px-3 py-2.5 text-right font-ui text-navy-500">
                      {t.on_hand}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-ui text-base font-bold text-navy-700">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <div
            key={r.material.id}
            className={`rounded-xl border-2 bg-cream-50 p-3 ${
              r.low ? 'border-warning' : 'border-navy-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-navy-700">{r.material.name}</span>
              <span className="font-ui text-lg font-bold text-navy-700">{r.total}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-navy-500">
              <span>Par {r.material.par}</span>
              {r.warehouses.map((w) => (
                <span key={w.warehouseId} className={w.low ? 'font-bold text-warning' : ''}>
                  {w.name} {w.on_hand}
                </span>
              ))}
              {r.trucks.map((t) => (
                <span key={t.truckId}>
                  {t.name} {t.on_hand}
                </span>
              ))}
              {r.low && <span className="font-bold text-warning">LOW STOCK</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Equipment totals */}
      {equipment.length > 0 && (
        <div className="mt-8">
          <p className="gg-eyebrow mb-1">Equipment</p>
          <h2 className="mb-3 font-display text-xl font-bold tracking-tight text-navy-700">
            Total On Hand
          </h2>
          <p className="mb-3 -mt-2 font-ui text-xs text-navy-400">
            Low level = par × {truckCount} truck{truckCount === 1 ? '' : 's'}. Red means order more to
            fully stock every truck.
          </p>
          <div className="flex flex-wrap gap-2">
            {equipment.map((e) => {
              const low = eqLow(e);
              const need = e.par * truckCount;
              return (
                <div
                  key={e.id}
                  className={`rounded-xl border-2 px-4 py-3 ${
                    low ? 'border-warning bg-warning/10' : 'border-navy-100 bg-cream-50'
                  }`}
                >
                  <div className={`font-display font-bold ${low ? 'text-warning' : 'text-navy-700'}`}>
                    {e.total_on_hand}
                    {low && (
                      <span className="ml-2 rounded bg-warning px-1.5 py-0.5 font-ui text-[10px] font-bold uppercase text-cream-50">
                        Low
                      </span>
                    )}
                  </div>
                  <div className="font-ui text-xs text-navy-500">
                    {e.name} <span className="text-navy-300">· par {e.par}/truck · need {need}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
