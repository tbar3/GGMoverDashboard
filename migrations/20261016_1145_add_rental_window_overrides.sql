-- Rental window overrides — the human say on a computed coverage gap.
--
-- Windows (coverage gaps / forecast rows) are still recomputed from jobs on every
-- load; this table only stores what a person decided about one:
--   dismissed  — "we don't need an extra truck for this" (doubling up, a job
--                moved, a crew is taking two trips). Hidden from the board.
--   edited     — the dates or truck count the schedule implies are wrong, so
--                use these instead.
--
-- A window is matched to its override by date OVERLAP, not by exact start date,
-- so a dismissal survives a job dropping off the first day. The snapshot columns
-- (needed_from, last_needed, trucks_needed) record the window as it was when the
-- decision was made: a dismissed window comes back if demand later grows past
-- that snapshot — earlier, later, or more trucks — because that is new work
-- nobody has looked at yet.
--
-- Additive and idempotent. No updated_at trigger — this schema has none; actions
-- set updated_at = NOW() by hand, like every other module here.

CREATE TABLE IF NOT EXISTS rental_window_overrides (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Snapshot of the computed window this decision was made against.
  needed_from        DATE NOT NULL,
  last_needed        DATE NOT NULL,
  trucks_needed      INTEGER NOT NULL,

  dismissed          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Edits. NULL means "use what the schedule says".
  override_from      DATE,
  override_return    DATE,
  override_trucks    INTEGER CHECK (override_trucks IS NULL OR override_trucks >= 0),

  note               TEXT,
  created_by_name    TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rental_window_override_range CHECK (last_needed >= needed_from),
  CONSTRAINT rental_window_override_dates
    CHECK (override_from IS NULL OR override_return IS NULL OR override_return >= override_from)
);

-- The board reads only overrides still in the horizon.
CREATE INDEX IF NOT EXISTS idx_rental_window_overrides_last_needed
  ON rental_window_overrides(last_needed);
