-- A truck row can back at most one rental that is OUT.
--
-- Pickup upserts the materials truck by name, which is deliberate: a Penske we
-- rented last month should come back to life rather than piling up dead rows.
-- But two rentals picked up at the same time under the same name shared a single
-- truck — so materials loaded for one were indistinguishable from the other, and
-- returning either would deactivate the truck the other was still using.
--
-- That happened in production. The application now refuses the clash with a
-- readable message; this index is what makes it unrepresentable, because the
-- readable message is only as good as the next caller remembering to go through
-- that code path.
--
-- Partial: only rentals with status 'picked_up' are constrained. Returned and
-- cancelled rentals keep pointing at the truck they used, which is the history.
--
-- NOTE: existing duplicate rows must be repaired BEFORE this runs, or index
-- creation fails. That repair was done first.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_truck_rental_out
  ON truck_rentals(truck_id)
  WHERE status = 'picked_up' AND truck_id IS NOT NULL;
