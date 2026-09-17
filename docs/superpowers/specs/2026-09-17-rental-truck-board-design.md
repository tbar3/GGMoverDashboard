# Rental Truck Board — Design

**Date:** 2026-09-17
**Status:** Approved, not yet implemented
**Module:** `/admin/rentals` (Operations)

## The problem

Three things slip today, and they are all timing:

1. **We don't know when to book.** We often know we'll need a truck on a given
   day, but nothing tells us the day by which it has to be reserved. The need is
   noticed late, and by then the vendor may be out of trucks.
2. **We don't know when it should go back.** The return date is a guess. A truck
   sits an extra week because nobody worked out that the last job needing it was
   Tuesday — or it goes back a day early and a job is short.
3. **There's no process for returning it.** Materials and equipment are still on
   board, nobody swept it, no fuel photo. Whatever wasn't done surfaces later as
   a vendor charge or missing inventory.

The board therefore **derives** dates from booked work. It is not a place to
record dates we already knew.

## What already exists (and what this must not duplicate)

- `admin-metrics.ts` computes `rentalDays`: days in the next 7 where booked
  SmartMoving jobs need more trucks than we own. The admin home shows it as an
  alert. This is the seed of the forecast — we keep the same 7-day horizon — but it
  stops at "you are short", with no book-by date, no return date, no record of what
  was done about it, and a capacity bug (below).
- Rentals already exist as **materials trucks** — `Penske 16'`, the Idealease
  trucks — holding real stock in `truck_stock`.
- `vehicles.ownership` already has `'rented'` as a value, and `vehicles.truck_id`
  links a fleet vehicle to a materials truck.
- `/materials/offload` (crew-facing) already moves stock off a truck via
  `offloadFromTruck`, which **requires the truck to have a `warehouse_id`**.
- `routine_items` is the established admin-editable checklist-template pattern.
- `app_settings` + `getNumberSetting()` is the established settings pattern.

## Capacity bug this fixes

`admin-metrics.ts` currently computes capacity as:

```sql
SELECT COUNT(*)::int AS c FROM trucks WHERE active = TRUE
```

That counts `Trailer` (not a truck) and counts **rentals currently in the truck
list**. Once this module is live, picking up a rental would raise capacity, the
shortfall that justified the rental would disappear, and the board would forget
why the truck is out.

Both the board and the admin home will use one shared function:

```
getOwnedTruckCapacity() =
  COUNT(trucks t)
  WHERE t.active
    AND NOT EXISTS (vehicle v ON v.truck_id = t.id WHERE v.ownership <> 'owned')
    AND NOT EXISTS (vehicle v ON v.truck_id = t.id WHERE v.vehicle_type = 'trailer')
```

A truck with no `vehicles` row counts as owned — the compliance migration seeded
a vehicle row for every active truck, and our own pickup flow always creates one
with `ownership='rented'`, so a missing row means a pre-existing company truck.

## The window algorithm

Pure, dependency-free functions in `src/lib/rentals-windows.ts` so the math can be
read and tested on its own.

For each day `d` in the next `RENTAL_HORIZON_DAYS` (7):

Seven days is deliberate: it matches how far out booked SmartMoving work is
actually trustworthy. With a 3-day lead time it leaves roughly four days between
a gap appearing and booking becoming urgent, so the horizon and the lead time
have to be read together — raising the lead time past 7 would mean every window
is born already late. Both are single constants and easy to retune.

- `D(d)` = `CEIL(SUM(quoted_trucks))` over `jobs` where `date = d`. Trucks are
  discrete: 2.5 quoted trucks means three trucks.

  **Demand source changed during implementation.** This was specced against
  booked `smartmoving_jobs`, mirroring the existing admin-home alert. Checking the
  live data before building the UI showed that import had stopped on 2026-07-24
  with nothing dated after 2026-08-01 and zero booked jobs from today forward — a
  forecast built on it would have been permanently, silently empty, and the admin
  home's rental alert is dead today for exactly that reason. The calendar-synced
  `jobs` table holds 35 upcoming moves out to December with `quoted_trucks`
  populated on every one. Both the board and the admin-home alert now read it.
- `C` = `getOwnedTruckCapacity()` (constant across the horizon).
- `shortfall(d)` = `max(0, D(d) - C)`.
- `covered(d)` = number of rentals with `status IN ('booked','picked_up')` whose
  `[needed_from, est_return_date]` spans `d`.

A **window** is a maximal run of consecutive days where `shortfall(d) > 0`.
Two runs separated by a gap of `RENTAL_BRIDGE_DAYS` (1) or fewer are **merged**:
returning a truck and re-renting it the next day costs more than keeping it.

Each window yields:

| Field | Derivation |
|---|---|
| `needed_from` | first day of the run |
| `last_needed` | last day of the run |
| `suggested_return` | `last_needed + 1 day` |
| `trucks_needed` | `max(shortfall(d))` across the run |
| `trucks_uncovered` | `max(shortfall(d) - covered(d))` across the run |
| `book_by` | `needed_from - rental_lead_time_days` |

**Window detection uses raw `shortfall`, not `shortfall - covered`.** A covered
window must stay visible, because that is what the rental is attached to and what
drift is measured against.

### Window states

| State | Condition |
|---|---|
| `covered` | `trucks_uncovered <= 0` |
| `planned` | uncovered, `today < book_by` |
| `book_now` | uncovered, `book_by <= today < needed_from` — amber |
| `late` | uncovered, `today >= needed_from` — red |

### Drift

For each rental with `status IN ('booked','picked_up')`, find the window
overlapping its coverage interval and compare:

- window `suggested_return` **after** `est_return_date` → *"Jobs booked since you
  reserved this need trucks through Oct 7 — this should stay out longer."*
- window `suggested_return` **before** `est_return_date` → *"Could go back a day
  early — one day's rate saved."*

Windows are never stored, so nothing can go stale. Drift is recomputed on load.

## Data model

Migration `migrations/20260917_1000_add_truck_rentals.sql`, additive and
idempotent, following module conventions.

```sql
CREATE TABLE IF NOT EXISTS truck_rentals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor            TEXT NOT NULL,
  vendor_ref        TEXT,                      -- reservation / confirmation #
  size              TEXT,                      -- 16', 26'
  needed_from       DATE NOT NULL,
  est_return_date   DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planned' CHECK (status IN
                      ('planned','booked','picked_up','returned','cancelled')),
  picked_up_at      TIMESTAMPTZ,
  returned_at       TIMESTAMPTZ,
  truck_id          INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  daily_rate        NUMERIC(10,2),
  notes             TEXT,
  created_by        UUID REFERENCES employees(id),
  created_by_name   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (est_return_date >= needed_from)
);
CREATE INDEX IF NOT EXISTS idx_truck_rentals_open
  ON truck_rentals(status, needed_from)
  WHERE status IN ('planned','booked','picked_up');

-- Checklist template. Mirrors routine_items. system_key marks items with
-- live behavior attached; NULL means a plain manual tick.
CREATE TABLE IF NOT EXISTS rental_offload_items (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  system_key  TEXT UNIQUE,                     -- e.g. 'materials_offloaded'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per ticked item: who said it was done, and when.
CREATE TABLE IF NOT EXISTS rental_offload_checks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rental_id       UUID NOT NULL REFERENCES truck_rentals(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES rental_offload_items(id) ON DELETE CASCADE,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by      UUID REFERENCES employees(id),
  checked_by_name TEXT NOT NULL,
  UNIQUE (rental_id, item_id)
);
```

Seeded checklist items: materials offloaded (`system_key='materials_offloaded'`),
equipment and pads off, swept out, trash removed, fuel level photographed,
personal items removed, damage photos taken, paperwork collected.

Settings: `rental_lead_time_days` in `app_settings`, default `3` from a new
`CONFIG.RENTAL_LEAD_TIME_DAYS`, read via the existing `getNumberSetting()`.

## Lifecycle

**Book** (`planned` → `booked`): vendor, reservation ref, dates. Dates prefill from
the window that prompted it.

**Pick up** (`booked` → `picked_up`): creates or reactivates a `trucks` row so crews
can load materials onto it, and a `vehicles` row with `ownership='rented'` linked
to it. **A home warehouse is required here** — `offloadFromTruck` refuses to run
without one, so omitting it breaks the return step days later. Stamps
`picked_up_at`.

**Offload**: the checklist. The `materials_offloaded` item is not a manual tick —
it reads `truck_stock` for the linked truck and shows "3 items still on board"
with a link to `/materials/offload?truck=<id>`. It satisfies itself when the
truck is empty.

**Return** (`picked_up` → `returned`): blocked while any active checklist item is
unticked or the truck still holds stock. On success: stamps `returned_at`, sets
`trucks.active = false` and `vehicles.active = false` so the rental drops out of
count sheets instead of lingering in every crew's truck picker.

**Cancel**: from `planned` or `booked` only.

## Files

| Path | Purpose |
|---|---|
| `src/lib/rentals-windows.ts` | Pure window math: shortfall, runs, merge, states, drift |
| `src/lib/truck-capacity.ts` | `getOwnedTruckCapacity()`, shared with `admin-metrics.ts` |
| `src/lib/rentals.ts` | Reads: rentals, windows, checklist state |
| `src/lib/rentals-actions.ts` | Writes, each calling `requireBackOffice()` |
| `src/lib/rentals-shared.ts` | Client-safe types, no `pg` import |
| `src/app/(authenticated)/admin/rentals/page.tsx` | Server page, `force-dynamic` |
| `.../admin/rentals/rentals-board.tsx` | Board shell |
| `.../admin/rentals/rental-card.tsx` | One rental + its checklist |
| `src/lib/nav.ts` | Operations area entry |
| `src/lib/admin-metrics.ts` | Switch capacity to the shared function |

Split by section rather than one large board file — `morning-meeting-board.tsx`
is 666 lines and adding to it is already awkward.

## UI

`/admin/rentals`, back office only (the `/admin` layout guard plus per-action
guards). Sections, in order:

1. **Needs booking** — windows in `book_now` / `late`, loudest first. Each shows
   dates, trucks needed, book-by, and a Book button.
2. **Out now** — picked-up rentals with the offload checklist inline, drift
   banners, and the return gate.
3. **Upcoming** — booked but not yet picked up.
4. **Forecast** — the full 7-day horizon, including covered windows.
5. **History** — returned and cancelled.

Overdue rentals (`est_return_date < today`, not returned) are highlighted **on
this board only**. No admin-home alert, no Morning Meeting entry — the board is
the one place.

The lead-time setting is edited on this board, not in Admin Settings, because
that is where it is understood.

## Edge cases

- **No SmartMoving data / stale import.** `smartmoving_jobs` is an import; if it's
  days old the forecast is wrong in a way that looks authoritative. Show the same
  `dataAsOf` stamp the admin home uses, and say the horizon is only as good as the
  last import.
- **`est_trucks` NULL** on a booked job: treated as 0 and counted in a "jobs with
  no truck estimate" note, so a silent NULL can't hide a gap.
- **Capacity is 0** (no owned trucks resolved): suppress the forecast rather than
  claiming every day is short.
- **Truck name collision**: `trucks.name` is UNIQUE. A returning-then-re-renting
  Penske 16' must reactivate the existing row, not insert a duplicate.
- **Rental deleted/cancelled after pickup**: not allowed; cancel is pre-pickup only.
- **Vendor row gone / job re-imported**: rentals hold their own vendor text, so
  nothing depends on a joined row surviving.

## Out of scope (v1)

Crew-facing offload checklist (back office ticks it), vendor catalog and rate
comparison, rental cost reporting beyond the stored `daily_rate`, notifications
outside the board, automatic booking or vendor APIs, and an admin editor UI for
the checklist items (seeded in the migration; editable later next to the
materials routines editor).

## Verification

The repo has no test framework — no vitest/jest/playwright, no test files, and
only `dev`/`build`/`start`/`lint` scripts. Verification is therefore:

1. Migration applied via the `db-migration` skill.
2. `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean.
3. Manual QA, in order:
   - A day needing more trucks than owned appears as a window with a book-by date.
   - Two gap days separated by one good day show as **one** window.
   - Booking a rental flips the window to `covered`; capacity does **not** change.
   - Pickup makes the truck appear in `/materials` for crews.
   - Loading materials onto it blocks return; the checklist item shows what's left.
   - Offloading to zero satisfies the item and allows return.
   - Return removes the truck from count sheets.
   - Booking a new job past the return date raises a drift banner.

The window math is the one piece with real logic and a silent failure mode. It is
written as a pure module so tests can be added later without restructuring;
adding vitest was offered and deferred.
