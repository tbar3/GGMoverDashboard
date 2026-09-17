-- Rental board: a planned pick-up time, and what the truck actually is.
--
-- PICK-UP TIME is the time we intend to COLLECT the truck, set when booking, so
-- whoever is fetching it knows when to be at the vendor. It is deliberately not
-- the same thing as truck_rentals.picked_up_at, which is stamped automatically
-- when the pickup is recorded — one is the plan, the other is the fact, and
-- collapsing them would lose the ability to see a pickup running late.
--
-- Stored as TIME (no zone): a wall-clock time in America/New_York, like the 7:15
-- meeting. A timestamptz would imply a precision we do not have about a date the
-- office may still move.
--
-- SPEC FLAGS are what the truck has. A crew loading a piano cares a great deal
-- whether it is a liftgate or a ramp, and that is not knowable from the vendor
-- name. Booleans default FALSE rather than NULL: "we did not tick it" and "it
-- does not have one" are the same answer here, and a nullable boolean would make
-- every caller handle a third state that carries no meaning.
--
-- Additive and idempotent. No data is moved or dropped.

ALTER TABLE truck_rentals ADD COLUMN IF NOT EXISTS pickup_time  TIME;
ALTER TABLE truck_rentals ADD COLUMN IF NOT EXISTS has_ramp     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE truck_rentals ADD COLUMN IF NOT EXISTS has_liftgate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE truck_rentals ADD COLUMN IF NOT EXISTS is_isuzu     BOOLEAN NOT NULL DEFAULT FALSE;
