# Materials Management Port — Design

**Date:** 2026-07-23
**Status:** Approved, not yet implemented
**Roadmap:** Company hub step 5 (materials port)

## Purpose

Bring the materials / inventory app the crew use every day into the hub, so warehouse
stock, truck stock, per-job count sheets, and the low-inventory / unclosed-job alerts live
in the same place as the rest of the business — behind the hub's single Clerk login and its
role model, instead of a separate app with its own two auth schemes.

## The hard constraint

`~/ClaudeProjects/gg-materials-management` is **live and in active use by crew right now**.
It must not be touched, and its data must not be lost. Every rule below follows from that:

- All porting is done from the read-only snapshot at
  `~/GGBackups/materials-source-copy-2026-07-22/`, never from the running app.
- The schema is rebuilt from the **live** structure captured in
  `~/GGBackups/materials_2026-07-22/` (13 tables), **not** the app's committed
  `db/schema.sql`, which has drifted — it is missing three tables that exist in production:
  `equipment`, `job_equipment`, and `warehouses`.
- We build the hub module against empty (or backup-loaded) tables. The real data is copied
  in **once, at cutover**, from the live DB — because any copy taken now goes stale the
  moment crew log another job. The live app keeps running until the hub version is tested
  and Trent gives an explicit go.

## Decisions

| Question | Decision |
|---|---|
| Table relationship | **Side-by-side.** Materials tables are ported into the hub schema (`mover_dashboard`) largely as-is, keeping their own data. Merging materials' job/people models into the hub's `jobs`/`employees` is a separate, later step — the hub's `jobs` is empty while materials' is full, so a blind merge would be guesswork. |
| Crew access | **Individual hub login.** Crew reach the count sheet as themselves (their `employees` row via `requireEmployee`), not through the old shared device passcode. Counts become attributable to a person, and materials uses the same login as the rest of the hub. |
| Admin access | Materials "admin" (the old `ADMIN_EMAILS` allowlist) becomes hub **back office** (`requireBackOffice`). |
| Primary keys | Materials tables keep their existing `SERIAL` integer PKs. The hub uses UUIDs elsewhere, but converting is pointless churn and risk for a self-contained set of tables that only reference each other. |
| Old auth tables | `allowed_users` is **dropped**. Access is governed entirely by the hub's `requireEmployee` / `requireBackOffice`; the app-level invite allowlist and the crew passcode both go away. |

## Auth model mapping

The materials app had two bespoke auth systems. Both collapse onto the hub's existing
two-tier model from `src/lib/auth.ts` — no new auth code.

| Materials app | Gate | Hub equivalent |
|---|---|---|
| Admin area (`/dashboard/*`) | `ADMIN_EMAILS` env allowlist | `requireBackOffice` |
| Crew count sheet (`/crew/*`) | shared `CREW_PASSCODE` cookie | `requireEmployee` |

Back office: inventory receive/adjust, reporting, history, all the admin editors (materials,
trucks, warehouses, equipment, routines, crew roster), and job management. Crew: view their
assigned jobs and fill in the count sheet (pre-dispatch / post-dispatch / post-job counts,
morning & close routines).

## Data model

Thirteen tables, ported into `mover_dashboard`. **Only one is renamed:** the materials app's
`jobs` collides with the hub's existing `jobs` table (SmartMoving moves — a different
concept), so it becomes **`materials_jobs`**, and every foreign key that pointed at `jobs`
(`job_counts.job_id`, `job_equipment.job_id`, `inventory_transactions.job_id`) is repointed.
Of the twelve ported tables (13 live, minus the dropped `allowed_users`), the eleven besides
`jobs` keep their names — they are already unambiguous in the materials domain, and minimising
renames keeps the port faithful to the ~1,400 lines of query code that reference them.

Tables and what they hold (row counts from the 2026-07-22 backup, for scale):

| Table | Rows | Purpose |
|---|---|---|
| `materials` | 23 | Catalog: par, thresholds, cost/charge, low-alert tier, storage-pad flag |
| `trucks` | — | Trucks, each carrying its own overnight stock |
| `warehouses` | — | Warehouse locations (**was missing from committed schema**) |
| `warehouse_stock` | — | On-hand per material, shelf |
| `truck_stock` | — | On-hand per material, per truck |
| `materials_jobs` (was `jobs`) | 63 | One trip on one truck on one day; morning/close routine JSON; storage-in flag |
| `job_counts` | 661 | Per-material counts for a job; `used` and `charged` for leakage |
| `equipment` | 7 | Non-consumable equipment catalog (**was missing**) |
| `job_equipment` | 363 | Dispatch/after equipment counts per job (**was missing**) |
| `inventory_transactions` | 507 | Append-only ledger: receive / load / use / adjust / return |
| `routine_items` | 6 | Configurable morning/close checklist items |
| `crew_members` | 21 | Roster of names for the count-sheet crew multi-select |
| ~~`allowed_users`~~ | 3 | **Dropped** — replaced by hub auth |

Recovered structure of the three drifted tables (from the live data dump, since they are
absent from `db/schema.sql`):

```sql
-- equipment
id SERIAL PK, name TEXT, par NUMERIC, total_on_hand NUMERIC, sort_order INT,
active BOOL, is_storage_pad BOOL, low_alerted (tier TEXT), created_at, updated_at

-- job_equipment
job_id INT FK -> materials_jobs, equipment_id INT FK -> equipment,
dispatch_count NUMERIC, after_count NUMERIC, PK (job_id, equipment_id)

-- warehouses
id SERIAL PK, name TEXT, sort_order INT, active BOOL, created_at, updated_at
```

The exact column types will be confirmed against the live table definitions during the
migration step, not inferred from data alone.

### `crew_members` vs `employees`

`crew_members` is a roster of free-text names that populates the crew multi-select on a count
sheet; the chosen names are stored as text on the job, so retiring a member never breaks
historical jobs. It does **not** collide with `employees` and is kept as-is for the
side-by-side port. Folding it into `employees` belongs to the later merge step, alongside the
`materials_jobs` ↔ `jobs` reconciliation.

## Surfaces to port

Routes land under `/admin/materials/*` (back office) and `/materials/*` (crew), matching the
hub's existing `(authenticated)/admin` vs crew split so the `admin/layout.tsx` guard covers
the back-office tree automatically.

**Back office** — dashboard overview, receive stock, adjust stock, reporting (usage,
leakage, cost/charge), transaction history, job list & detail, new job, and the admin
editors (materials, trucks, warehouses, equipment, routines, crew roster).

**Crew** — assigned-jobs list and the count sheet (`/materials/jobs/[id]`): pre-dispatch,
post-dispatch, post-job counts, storage-in pad usage, and the morning/close routines.

**Background** — the two Resend email crons (`low-inventory`, `unclosed-jobs`) port as hub
API routes wired to Vercel cron. They need `RESEND_API_KEY` and the alert-recipient config in
the hub's env; the low-inventory cron relies on the per-material `low_alert_tier` column so it
emails once per tier crossing, not every run.

## Migration & cutover sequence

1. **Schema migration** (the immediate next step): create all 13 tables in `mover_dashboard`
   from the live structure, with `jobs` → `materials_jobs` and FKs repointed. Additive only —
   touches nothing the hub already has. Idempotent, following the project's migration
   conventions.
2. Build the back-office and crew surfaces against the ported schema, porting `queries.ts` /
   `actions.ts` logic and swapping the two old auth models for the hub guards.
3. Port the email crons.
4. Test the full flow in the hub against a **copy** of live data (loaded from a fresh dump).
5. **Cutover** (only on Trent's explicit go): take a final dump from the live DB, load it into
   the hub tables, and **reset the `SERIAL` sequences** past the loaded max ids so new inserts
   don't collide. Point crew at the hub. The live app is retired but left intact as a fallback.

## Risks & known traps

- **Schema drift** — already the biggest one; mitigated by building from the live dump, not
  `db/schema.sql`. Three tables would have been silently dropped otherwise.
- **SERIAL sequence collision after data load** — loading rows with explicit ids does not
  advance the sequence; step 5 must `setval` each sequence or the first new insert fails.
- **Stale data** — never copy live data early. The only authoritative copy is the one taken at
  cutover.
- **Env dependencies** — `RESEND_API_KEY`, alert recipients, and Vercel cron config must exist
  in the hub before the crons work; absence should fail loud, not silently skip alerts.
- **`generated` column** — `job_counts.used` is a stored generated column
  (`post_dispatch - post_job`); the migration must recreate it as generated, and the data load
  must not try to insert into it.

## Out of scope (this spec)

Merging `materials_jobs` into the hub's `jobs` and `crew_members` into `employees` (the later
"merge" step); PM/truck-maintenance tracking (roadmap step 6, though it will build on the
ported `trucks` table); any redesign of the count-sheet UX beyond what's needed to fit hub
components. The port aims for behavioural parity first.
