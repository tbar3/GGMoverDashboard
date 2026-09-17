import { getRentalBoard, getWarehouses } from '@/lib/rentals';
import RentalsBoard from './rentals-board';

// Windows are recomputed from the live schedule on every view, and picking a
// truck up changes the board under you. Nothing here is safe to cache.
export const dynamic = 'force-dynamic';

export default async function RentalsPage() {
  const [data, warehouses] = await Promise.all([getRentalBoard(), getWarehouses()]);

  return <RentalsBoard data={data} warehouses={warehouses} />;
}
