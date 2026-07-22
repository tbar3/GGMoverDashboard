# Policies Module — Design

**Date:** 2026-07-22
**Status:** Approved, not yet implemented
**Roadmap:** Company hub step 3 (after security foundation and grouped nav)

## Purpose

Put the employee handbook, SOPs, and standing company policy in the hub, and record that
crew have read the ones that carry consequences. GoodGuys policies attach real money to
behaviour — the 2x penalty on unreported damage, the 7:15 AM tardy cutoff — so "who agreed
to this, and to exactly what wording" needs to be answerable later.

This is the **first crew-facing hub surface**. Everything else back office has built so far
is walled off from crew; Policies deliberately is not.

## Decisions

| Question | Decision |
|---|---|
| Who reads | All published policies are visible to every employee, crew included. Back office authors. |
| Sign-off | Tracked. Crew acknowledge a policy explicitly; back office can see who has and hasn't. |
| Re-signing on edit | The author decides per edit. A "substantive change" flag bumps the version and resets acknowledgement; a plain edit leaves sign-offs intact. |
| Language | Every policy carries an English body and a Spanish body. Crew see whichever matches their existing locale toggle. English is required to publish; a missing Spanish body is flagged in the admin list but does not block publishing, and crew fall back to English. |
| Authoring format | Markdown, rendered with `react-markdown` (no raw HTML). |
| Categories | Fixed list, not a table: Safety, Conduct, Pay & Benefits, Operations, Vehicles, General. |
| Lifecycle | `draft` → `published` → `archived`. Crew see only `published`. |

## Data model

Three tables, following existing conventions (UUID PKs, `TIMESTAMPTZ`, CHECK-constrained
enums, explicit indexes).

```sql
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  title_es TEXT,
  category TEXT NOT NULL CHECK (category IN
    ('safety','conduct','pay_benefits','operations','vehicles','general')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body_en TEXT NOT NULL,
  body_es TEXT,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (policy_id, version)
);

CREATE TABLE IF NOT EXISTS policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_version_id UUID NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (policy_version_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_category ON policies(category);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_ack_version ON policy_acknowledgements(policy_version_id);
CREATE INDEX IF NOT EXISTS idx_policy_ack_employee ON policy_acknowledgements(employee_id);
```

### Why acknowledgements point at a version, not a policy

`policy_acknowledgements` references `policy_version_id`. This is what makes the sign-off
record worth having: the acknowledged row leads directly to the frozen `body_en`/`body_es`
that person agreed to. Resetting acknowledgement needs no cascade delete — a new version row
simply has no acknowledgements yet, and the old ones survive as history.

"Has this employee signed the current version?" is therefore: does a row exist joining the
policy's current version to that employee.

### The current version

The current version of a policy is its highest-numbered `policy_versions` row. There is no
`current_version_id` column on `policies` — that would be a circular foreign key and a
denormalisation that can drift.

A policy always has at least one version row, created with the policy itself. A version with
`published_at IS NULL` is an unpublished working copy.

### Known trade-off: non-substantive edits mutate signed text

A non-substantive edit updates `body_en`/`body_es` **in place** on the current version, which
means text someone already acknowledged can change without their re-signing. This is the
deliberate cost of the "author decides" model — the alternative is making everyone re-sign
over a typo, which trains people to click through prompts.

The mitigation is that it's the author's explicit choice on every save, defaulting to
substantive. It's worth revisiting if edit-without-bump ever gets used carelessly.

## API surface

Every route uses a guard from `src/lib/auth.ts`. No route ships with only an `if (!user)`
check.

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/api/policies` | GET | `requireEmployee` | Back office see all; crew see only `published`. |
| `/api/policies` | POST | `requireBackOffice` | Creates policy + version 1. |
| `/api/policies/[id]` | GET | `requireEmployee` | Crew get 404 for non-published. |
| `/api/policies/[id]` | PATCH | `requireBackOffice` | Edits title, category, and body. Carries `substantive: boolean`, which defaults to `true` when absent. Does **not** change `status`. |
| `/api/policies/[id]/publish` | POST | `requireBackOffice` | The only route that changes `status`, sets `published_at`/`published_by`, and archives. Publishing is a distinct action with side effects, so it does not share the edit route. |
| `/api/policies/[id]/acknowledge` | POST | `requireEmployee` | Always records the **caller's own** id — never an id from the request body. |
| `/api/policies/[id]/acknowledgements` | GET | `requireBackOffice` | Who has and hasn't signed. |

The acknowledge route is the one to watch: taking `employee_id` from the body would let
anyone sign on another person's behalf. It reads `guard.employee.id` only.

## UI

**Back office** — `/admin/policies` list (title, category, status, version, signed count),
`/admin/policies/new`, `/admin/policies/[id]` edit with a substantive-change checkbox and a
sign-off roster showing who is outstanding. A "Spanish translation missing" warning shows on
any policy with an empty `body_es`.

**Crew** — `/policies` list of published policies, grouped by category, with unacknowledged
ones surfaced first; `/policies/[id]` renders the body in the crew's locale with an
"I've read and understand this" button. Falls back to English when `body_es` is empty.

Both surfaces are added to `src/lib/nav.ts` — Policies flips from `planned` to `live` for
back office, and the crew nav gains a Policies entry.

## Error handling

- Acknowledging twice is a no-op, not an error (the UNIQUE constraint makes it idempotent).
- Acknowledging an unpublished or archived policy returns 400.
- Publishing a policy whose `body_en` is empty returns 400.
- Crew requesting a non-published policy by id get 404, not 403 — a 403 confirms it exists.

## Testing

- Crew cannot see draft or archived policies through `/api/policies` or by direct id.
- Crew cannot acknowledge on another employee's behalf by passing `employee_id`.
- A substantive edit resets acknowledgement; a non-substantive edit does not.
- Acknowledging twice produces one row.
- Spanish body falls back to English when absent.
- Back office roster correctly lists outstanding signers among active employees.

## Out of scope

Rich-text/WYSIWYG authoring, file attachments and PDF export, per-role policy targeting,
scheduled publishing, email or push reminders to chase outstanding sign-offs, and policy
search. Reminders are the most likely next addition once real policies exist.
