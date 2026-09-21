// Client-safe types for the rental board. No DB import, so the board component
// can use these without pulling in pg.

export type RentalStatus = 'planned' | 'booked' | 'picked_up' | 'returned' | 'cancelled';

/**
 * What each status is called on screen.
 *
 * The stored value stays `planned` while the label reads "Needs booking":
 * renaming a CHECK-constrained value means a migration and a data rewrite for a
 * word nobody sees. "Out now" and "picked up" are the same state — a truck in
 * our hands — so there is one status, not two.
 */
export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  planned: 'Needs booking',
  booked: 'Booked',
  picked_up: 'Out now',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

/** The statuses a rental can be logged AS, in lifecycle order. */
export const LOGGABLE_STATUSES: { value: 'planned' | 'booked' | 'picked_up'; label: string }[] = [
  { value: 'planned', label: 'Needs booking' },
  { value: 'booked', label: 'Booked' },
  { value: 'picked_up', label: 'Picked up — already have it' },
];

export interface TruckRental {
  id: string;
  vendor: string;
  vendor_ref: string | null;
  size: string | null;
  /** What this rental covers, inclusive. Compared against fresh demand windows. */
  needed_from: string;
  est_return_date: string;
  /**
   * Planned time to COLLECT it, as "HH:MM" wall-clock (America/New_York), or null.
   * The plan — `picked_up_at` is the fact.
   */
  pickup_time: string | null;
  /** What the truck is. A crew loading heavy items needs to know which of these. */
  has_ramp: boolean;
  has_liftgate: boolean;
  is_isuzu: boolean;
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

/** A home warehouse a rental truck can be assigned to at pickup. */
export interface WarehouseOption {
  id: number;
  name: string;
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
