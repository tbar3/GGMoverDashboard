# Crew Meetings — Design

**Date:** 2026-09-21
**Status:** Approved in conversation, not yet implemented
**Module:** `/admin/meetings` (People area)

## The problem

There is nowhere to remember to sit down with the crew. Quarterly reviews happen
when someone thinks of them, which means they stop happening. Ad-hoc
conversations — good work worth saying out loud, a problem worth naming, or just
catching up with someone — leave no trace, so a recurring issue looks new every
time it comes up and a run of good months goes unrecorded at review time.

In the owner's words: *"a quarterly meeting scheduler, as well as an ad hoc
scheduler with anyone, to discuss positive or negative feedback, or just catch up
with a guy."*

## Decisions

| Question | Decision |
|---|---|
| Cadence or scheduler? | **Both.** A quarterly cadence that surfaces who is due, plus ad-hoc meetings booked any time |
| Quarterly anchor | **Fixed calendar quarters** for everyone (Jan / Apr / Jul / Oct) |
| Who sees it | **Back office only** — no crew-facing surface, same as morning-meeting discussion points |
| Who can be met | Quarterly cadence: **crew only**. Ad-hoc: **anyone**, back office included |
| Meeting types | quarterly review · positive feedback · negative feedback · catch-up |

**On fixed quarters.** Deriving the clock from each person's last meeting was
recommended and not chosen. Two consequences, accepted deliberately: every review
bunches into the same fortnight four times a year, and a person hired early in a
quarter would read as "due" almost immediately. The second is mitigated below by
excluding anyone whose start date falls inside the current quarter — which also
keeps this from colliding with the 30-day new-crew evaluation they have just had.
The bunching is left as-is; revisit if it proves painful.

## What this mirrors

`new_crew_evaluations` (migration 20260726) already solves a near-identical
problem and sets the conventions to follow:

- **Due is derived, never pre-seeded.** `getPendingNewCrewEvals()` computes
  due/overdue from `start_date` against `CURRENT_DATE`. No scheduled rows exist
  until something actually happens, so nothing can drift out of date.
- `completed_at IS NULL` means pending; a partial unique index enforces one open
  item per employee.
- The crew filter is `e.is_active = TRUE AND e.role IN ('driver', 'lead', 'helper')`.
- It surfaces in three places: the hub alert, the hiring page, and a card on the
  employee detail page.

## Data model

Migration `migrations/20260921_<HHMM>_add_crew_meetings.sql`, additive and
idempotent. No `updated_at` trigger — this schema has none anywhere; actions set
`updated_at = NOW()` by hand.

```sql
CREATE TABLE IF NOT EXISTS crew_meetings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN
                      ('quarterly_review', 'feedback_positive',
                       'feedback_negative', 'catch_up')),

  -- Which quarter a quarterly review satisfies, as '2026-Q3'. NULL for ad-hoc.
  -- Stored rather than derived from scheduled_for: a Q3 review held in the first
  -- week of October still closes out Q3, and the date alone cannot say that.
  quarter           TEXT,

  scheduled_for     DATE NOT NULL,
  scheduled_time    TIME,                    -- wall-clock, America/New_York
  completed_at      TIMESTAMPTZ,             -- NULL = still scheduled
  notes             TEXT,

  created_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_by_name   TEXT NOT NULL,
  completed_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  completed_by_name TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A meeting marked done with nothing written down is the failure mode this
  -- module exists to prevent: it is the record, not the calendar entry, that
  -- makes a recurring problem visible. One line is enough, but there has to be one.
  CONSTRAINT crew_meetings_completed_has_notes
    CHECK (completed_at IS NULL OR notes IS NOT NULL),
  -- A quarterly review needs the quarter it belongs to; ad-hoc must not have one.
  CONSTRAINT crew_meetings_quarter_matches_type
    CHECK ((type = 'quarterly_review') = (quarter IS NOT NULL))
);

-- One quarterly review per person per quarter, scheduled or completed.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_crew_meeting_quarter
  ON crew_meetings(employee_id, quarter)
  WHERE type = 'quarterly_review';

CREATE INDEX IF NOT EXISTS idx_crew_meetings_employee ON crew_meetings(employee_id);
CREATE INDEX IF NOT EXISTS idx_crew_meetings_open
  ON crew_meetings(scheduled_for) WHERE completed_at IS NULL;
```

## Who is due

Pure SQL, computed on every load, nothing seeded:

```
current quarter = date_trunc('quarter', NOW() AT TIME ZONE 'America/New_York')
due = active crew (role IN driver/lead/helper)
      WHERE start_date < quarter_start          -- hired before this quarter
        AND NOT EXISTS a crew_meetings row for (employee, current quarter)
```

Status within the quarter: **due** from the quarter's first day, **overdue** in
its final 30 days. A person hired inside the current quarter is not listed at all
until the next one.

`America/New_York` explicitly, like every other date boundary in this app — a bare
`CURRENT_DATE` rolls over at 8pm ET and would move people into a new quarter for
the last four hours of every day.

## Surfaces

| Where | What |
|---|---|
| `/admin/meetings` | The module: who's due this quarter, what's scheduled, recent history |
| People dashboard | Replaces the dashed placeholder with a real card, plus a "due this quarter" stat |
| `nav.ts` | New item in the People area, group **Team** |
| Employee detail page | A Meetings card: that person's history and a schedule button, beside the existing eval card |

No hub alert in v1. The hub already carries six alert types; adding a seventh for
something with its own dashboard stat makes the hub a dumping ground.

No crew-facing surface at all, per the visibility decision.

## Flow

**Schedule** — pick a person, a type, a date and optionally a time. For a
quarterly review the quarter is set automatically from the date. Ad-hoc meetings
can target any employee; the quarterly list only offers crew.

**Complete** — record what was said. Notes are required by the database, not just
the form.

**Reschedule / cancel** — a scheduled meeting can be moved or deleted while
`completed_at IS NULL`. A completed one is a record and stays.

## Files

| Path | Purpose |
|---|---|
| `migrations/20260921_<HHMM>_add_crew_meetings.sql` | Schema |
| `src/lib/crew-meetings-shared.ts` | Client-safe types, no `pg` |
| `src/lib/crew-meetings.ts` | Reads: due list, scheduled, history |
| `src/lib/crew-meetings-actions.ts` | Writes, each `requireBackOffice()` |
| `src/app/(authenticated)/admin/meetings/page.tsx` | Server page, `force-dynamic` |
| `src/app/(authenticated)/admin/meetings/meetings-board.tsx` | The board |
| `src/app/(authenticated)/admin/employees/[id]/meetings-card.tsx` | Per-person history |
| `src/lib/nav.ts` | New People item |
| `src/app/(authenticated)/admin/people/page.tsx` | Placeholder card → real link + stat |

## Edge cases

- **Terminated crew.** `ON DELETE CASCADE` matches the eval table, but employees
  are deactivated rather than deleted here, so history survives in practice.
  Inactive people drop off the due list and keep their record.
- **Back-office ad-hoc meetings** have no quarter and never appear in the due list.
- **A Q3 review held in October** still closes Q3, because the quarter is stored
  rather than inferred from the date.
- **Double-booking a quarter** is refused by the unique index, not by the UI alone.
- **Role changes** (helper promoted to lead) do not affect anything; the filter is
  crew-vs-back-office, not a specific role.

## Verification

No test framework in this repo. So: migration applied via the `db-migration`
skill, `tsc --noEmit`, `eslint`, `npm run build`, a rolled-back transaction
rehearsing schedule → complete against the real schema, then manual QA:

1. A crew member hired before this quarter with no review appears as due.
2. Someone hired inside this quarter does not.
3. Scheduling a quarterly review removes them from the due list.
4. Completing with empty notes is refused by the database.
5. Two quarterly reviews for the same person and quarter are refused.
6. An ad-hoc meeting with a back-office person works and never shows as due.
7. The People dashboard stat and the employee card both reflect the same data.

## Out of scope

Reminders and notifications, any crew-facing view, recurrence other than
quarterly, calendar/email integration, and ratings — the 30-day evaluation owns
structured scoring; this module records a conversation.
