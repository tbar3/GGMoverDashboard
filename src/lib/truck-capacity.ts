import { queryOne } from '@/lib/db';

/**
 * How many trucks we can actually put on the road on our own.
 *
 * This exists because the obvious version is wrong. admin-metrics.ts counted:
 *
 *     SELECT COUNT(*) FROM trucks WHERE active = TRUE
 *
 * which counts the Trailer (not a truck) and counts every rental sitting in the
 * materials truck list. That second part is the dangerous one: the rental board
 * flags a day as short when demand exceeds capacity, so a rental picked up to
 * cover that day would RAISE capacity, erase the shortfall, and the board would
 * forget why the truck is out. The number has to mean "trucks we own", always.
 *
 * A truck with no vehicles row counts as owned. The compliance migration seeded a
 * vehicle for every active truck, and our own pickup flow always writes one with
 * ownership='rented' — so a missing row means a company truck that predates the
 * fleet registry, not an unknown.
 */
export async function getOwnedTruckCapacity(): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int AS c
       FROM trucks t
       LEFT JOIN vehicles v ON v.truck_id = t.id
      WHERE t.active = TRUE
        AND COALESCE(v.ownership, 'owned') = 'owned'
        AND COALESCE(v.vehicle_type, 'box_truck') <> 'trailer'`
  );
  return row?.c ?? 0;
}
