# Manual Marketing Payroll Line — Design

**Date:** 2026-09-24
**Status:** Approved in conversation, not yet implemented
**Module:** `/admin/payroll` — Run tab, Review & Correct

## The problem

Someone who does marketing all week and never goes out on a move does not appear
in the SmartMoving payroll report. The payroll run is built from that report, so
they are invisible to it — and therefore do not get paid.

In the owner's words: *"I also need to be able to manually add a line for someone
in marketing who may not have been on a job and therefore not on the payroll
report, but still need to be able to add them in so they can get paid."*

The gap is latent rather than active today. Cam Woods — the marketing case — has
a `payroll_entries` row every week, because SmartMoving emits a zero row for him
(billable 0, warehouse 0, rate $20). The join finds him, so his marketing hours
layer on correctly. The moment someone is absent from the report *entirely*, they
vanish from the run no matter what else exists for them that week.

`computePayrollRun` (`src/lib/payroll-run.ts:285`) loops over rows from
`payroll_entries` and looks up marketing hours by employee id. Marketing hours,
mileage, and overrides are all joined onto that roster — none of them can put a
person *on* it.

## Decisions

| Question | Decision |
|---|---|
| Which hours can be added manually? | **Marketing only.** Billable and warehouse are out of scope |
| Where is the row added? | **Inline in Review & Correct**, below the table |
| Who can be added? | **Dropdown of existing employees only** — no free-text names |
| Where does the rate come from? | **Typed on the row**, prefilled from `employees.hourly_rate` |
| Dollar figures (tips / commissions / bonus / miles) | Existing override cells — **no new code** |
| Do manual hours earn weekly bonus? | **No** — marketing is already excluded from the bonus basis |
| New table? | **No.** Extend `marketing_hours` with a rate column |

**On dropdown-only.** Free-text names were designed and then rejected by the
owner: *"I don't think I want to be able to type a name... id have to add an
employee there before i can put them into the payroll section manually."* That
choice removed four columns from the design — a nullable `employee_id`, a
denormalised `employee_name`, a per-row `classification`, and a partial unique
index needed only because Postgres treats NULLs as distinct. It also makes orphan
pay records structurally impossible.

**On ordering.** The owner confirmed: *"I wouldn't ever add a manual line without
first having uploaded the payroll file itself."* Two simplifications follow. The
period dropdown needs no change, because a manual-only week cannot exist. And the
collision rule debated earlier is unnecessary — see *Collisions resolve
themselves* below.

## Why not a new table

A dedicated `payroll_manual_lines` table was designed in full and then dropped
when the scope narrowed to marketing-only. Recorded here so the reasoning is not
rediscovered later.

Marketing hours already have a home: `marketing_hours` exists, the Marketing tab
already lists every active employee, and crew can self-serve through their
`marketing_token` link. The entry mechanism is built. The *only* reason a
marketing-only person is missing from the run is the roster query. A new table
would have duplicated an existing one to solve a problem that is one `UNION`
wide.

If a manual **billable** or **warehouse** row is ever needed — a mover whose job
failed to sync — that is when `payroll_manual_lines` earns its place. Not before.

## What this mirrors

`payroll_overrides` and `marketing_hours` (migration `20260814`) set the
conventions this follows: `UNIQUE (employee_id, week_start)`, a `note` column, an
`entered_by` / `updated_by` actor, `created_at` / `updated_at` set by hand (this
schema has no triggers anywhere), an index on `week_start`, and additive
idempotent DDL.

The guiding principle from that migration's header is the one that shapes this
design: *"NULL = use the computed value, so a re-import never clobbers a
correction."* Manual entry lives beside imported data, never inside it.

## Data model

Migration `migrations/20260924_<HHMM>_marketing_hours_rate.sql`, additive and
idempotent:

```sql
ALTER TABLE marketing_hours
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

COMMENT ON COLUMN marketing_hours.hourly_rate IS
  'Rate for a marketing-only week. Rate normally arrives per-week on the imported
   payroll_entries row; someone absent from the report has none to inherit.
   NULL = fall back to employees.hourly_rate.';
```

One nullable column. Nothing else changes.

## The roster union

`computePayrollRun` gains one query in its existing `Promise.all`:

```
marketing-only people =
  marketing_hours rows for the week
  WHERE hours > 0
    AND NOT EXISTS (payroll_entries row for that employee + week)
  JOIN employees for name, classification, is_active, annual_salary
```

Each result is mapped into the same row shape the loop already consumes —
`billable_hours` 0, `warehouse_hours` 0, `hourly_rate =
COALESCE(mh.hourly_rate, e.hourly_rate, 0)` — and appended to `entries` before
the loop runs.

**Normalise, do not duplicate.** The pay arithmetic at `payroll-run.ts:334-363`
stays untouched and runs for both sources. That block is what
`payroll-compute.ts` documents as the reference implementation of a week's pay;
there must not be a second copy of it.

`WHERE hours > 0` is load-bearing. `saveMarketingHours` permits `hours >= 0`, so
without it a zero-hour entry would conjure a phantom $0 line into the run.

## What needs no change

Everything downstream reads `run.detail`, so all of it works untouched:

- **Overrides.** `ovByEmp` is keyed by `employee_id`. The moment the row exists,
  the existing Tips / Commissions / Bonus / Miles cells edit it. This is why the
  owner's "manual dollar figures" requirement costs nothing.
- **Overtime.** Marketing hours already join `total`, so the 40-hour split
  applies normally.
- **Close.** `payroll-close.ts` iterates `run.detail` and freezes each row into
  `payroll_run_lines`.
- **ADP export.** Built from `run.w2` / `run.contractors1099`, which the loop
  already populates. The CSV uses names only.
- **Audit cross-foot.** All three checks in `buildChecks` compute from
  `run.detail` and `totals`, so manual rows land on both sides of every equation
  and the checks still tie.

Two cosmetic follow-ups: the audit's `provenanceRow` count reads "N rows
imported" and would understate headcount, and a marketing-only row with no rate
should raise the existing `$0 hourly rate` warning.

## Collisions resolve themselves

If a corrected report is later uploaded that *does* include the person, they gain
a real `payroll_entries` row. The `NOT EXISTS` clause then stops synthesising the
marketing-only row, and their marketing hours layer on through `mktByEmp` —
exactly today's behaviour for Cam Woods.

No double pay, no stale row to delete, no warning required. The design has no
collision state to resolve because the two sources cannot both produce a row for
the same person.

## UI

`CorrectionsTable` (`corrections-table.tsx`, 298 lines) currently takes
`{ weekStart, detail }` and is rendered at `run-tab.tsx:108`.

- **The Marketing cell is already inline-editable** (`corrections-table.tsx:213`
  → `saveMarketingHours`). Editing is not new work.
- **New:** an add-row control below `</Table>` — employee dropdown, hours, rate,
  Add button.
- **New prop:** `addable` — eligible employees, fetched in `run-tab.tsx`. Filter
  is `is_active = TRUE AND exclude_from_roster = FALSE`, minus anyone already in
  the run. That filter also removes the four duplicate active employees
  (`Andrew Johnson`, `Jack Sawyer`, `Sy Lovingood`, `Trent Barron`), each of whom
  is a real row plus an `exclude_from_roster` portal login.
- **New field:** `PayrollDetailRow.marketingOnly: boolean`, so the Rate cell —
  currently read-only — becomes editable for these rows only. Without it a wrong
  rate could not be fixed without deleting and re-adding.
- No columns are added, so the existing `colSpan={12}` / `colSpan={13}` stay
  correct.

**New action** `addMarketingRow(employeeId, weekStart, hours, rate)` in
`run/actions.ts`: upserts `marketing_hours` including the rate, logs to
`payroll_change_log` under the existing `'marketing'` scope, guarded by
`requireBackOffice` like its siblings.

## Add Employee form gains a rate

`createEmployee` (`employees/new/actions.ts:39`) already accepts an optional
`hourlyRate` and inserts `input.hourlyRate ?? null` — but the form never passes
it. That is why **24 of 28 active employees have no rate at all**.

Since the workflow now ends with "add them on the Employees tab first," landing
there with no rate would send the owner straight back to typing one on the
payroll row. Add an optional Hourly Rate field to the form and pass it through.
The action signature needs no change.

## Out of scope

- **Manual billable / warehouse rows.** Revisit if jobs start failing to sync.
- **Manual hours earning weekly bonus.** Bonus hours come from `getWeekBoard`,
  which reads `payroll_entries` directly (`bonus.ts:296-300`). Marketing is
  excluded from the bonus basis by existing policy, so this is correct as-is. If
  a job genuinely failed to sync, the fix is re-importing a corrected report, not
  hand-entering hours that silently earn bonus.
- **Fully loaded payroll cost** (employer taxes, workers comp, 401k match).
  Separate piece of work, discussed but not specced.

## Related fix, already applied

`approveWeek` (`src/lib/bonus-actions.ts`) now refuses to lock a bonus week with
no `payroll_entries` rows. Bonus is `hours × base_rate × multiplier` and hours
come from the payroll import, so locking first froze $0 for everyone — and
because the snapshot keeps only people with hours or events, most of the crew got
no row at all. This happened for real on 2026-09-14: the week was approved at
19:10:38, the report imported at 19:13:58, and all five snapshot rows froze at
`hours = 0, bonus = 0` with correct multipliers. Reopening and re-approving fixed
it. Typechecked, not yet exercised against the database.
