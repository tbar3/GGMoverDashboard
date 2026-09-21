import { notFound } from 'next/navigation';
import { getRentalById, getOffloadItems, getOffloadState } from '@/lib/rentals';
import RentalDetail from './rental-detail';

// A rental changes under you — picked up, offloaded, returned.
export const dynamic = 'force-dynamic';

export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rental = await getRentalById(id);
  // Deleted, or a stale link: a proper not-found rather than a 500.
  if (!rental) notFound();

  const items = await getOffloadItems();
  // Only meaningful once there is a truck attached; a rental that was never
  // picked up has nothing to have offloaded.
  const offload = rental.truck_id ? await getOffloadState(rental, items) : null;

  return <RentalDetail rental={rental} items={items} offload={offload} />;
}
