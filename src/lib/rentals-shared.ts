// Client-safe types for the rental board. No DB import, so the board component
// can use these without pulling in pg.

export type RentalStatus = 'planned' | 'booked' | 'picked_up' | 'returned' | 'cancelled';

export interface TruckRental {
  id: string;
  vendor: string;
  vendor_ref: string | null;
  size: string | null;
  /** What this rental covers, inclusive. Compared against fresh demand windows. */
  needed_from: string;
  est_return_date: string;
  status: RentalStatus;
  picked_up_at: string | null;
  returned_at: string | null;
  /** Set at pickup: the materials truck crews load, so stock can be tracked on it. */
  truck_id: number | null;
  truck_name: string | null;
  vehicle_id: string | null;
  daily_rate: number | null;
  notes: string | null;
  created_by_name: string;
  created_at: string;
}

export interface OffloadItem {
  id: number;
  label: string;
  /** Non-null marks an item with live behaviour — see materials_offloaded. */
  system_key: string | null;
  sort_order: number;
}

export interface OffloadCheck {
  item_id: number;
  checked_at: string;
  checked_by_name: string;
}

/**
 * Everything the return gate needs for one rental.
 *
 * `materials_remaining` is read from truck_stock rather than trusted to memory:
 * the whole point of the checklist is that "we emptied it" is checkable.
 */
export interface RentalOffloadState {
  rental_id: string;
  checks: OffloadCheck[];
  materials_remaining: number;
  /** Every active item ticked AND nothing left on the truck. */
  can_return: boolean;
  blocking_reason: string | null;
}
