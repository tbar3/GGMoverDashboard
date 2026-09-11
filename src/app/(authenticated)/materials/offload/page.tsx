import Link from 'next/link';
import { getCurrentEmployee } from '@/lib/auth';
import { getTrucks } from '@/lib/materials/queries';
import { getTruckOnHand } from '@/lib/materials/live-inventory';
import { OffloadForm } from './offload-form';

export const dynamic = 'force-dynamic';

export default async function OffloadPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return (
      <div className="p-6">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-muted-foreground">
            Employee profile not found. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const { truck: truckParam } = await searchParams;
  const trucks = await getTrucks();
  const truckId = Number(truckParam) || null;
  const truck = trucks.find((t) => t.id === truckId) ?? null;
  const rows = truck ? await getTruckOnHand(truck.id) : [];

  return (
    <div className="p-6">
      <p className="gg-eyebrow mb-1">Materials</p>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-navy-700">
        Offload a Truck
      </h1>
      <p className="mb-5 font-ui text-sm text-navy-500">
        Taking materials off a truck and putting them back in the warehouse? Enter the amounts
        here. No job needed — do this in the morning for anything this truck won&apos;t need, or
        at the end of the day to empty it out.
      </p>

      {trucks.length === 0 ? (
        <p className="rounded-lg border-2 border-warning bg-warning/10 p-4 font-ui text-sm text-navy-700">
          No trucks set up yet — ask Trent.
        </p>
      ) : !truck ? (
        <div className="gg-card">
          <p className="gg-eyebrow mb-2">Step 1 · Pick the truck</p>
          <div className="flex flex-wrap gap-2">
            {trucks.map((t) => (
              <Link
                key={t.id}
                href={`/materials/offload?truck=${t.id}`}
                className="rounded-xl border-2 border-navy-100 bg-cream-50 px-4 py-3 font-ui text-sm font-semibold text-navy-700 hover:bg-cream-200"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <OffloadForm truckId={truck.id} truckName={truck.name} rows={rows} />
      )}

      <div className="mt-6">
        <Link href="/materials" className="font-ui text-sm font-semibold text-navy-500 underline">
          ← Back to Materials
        </Link>
      </div>
    </div>
  );
}
