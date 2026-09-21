# Navigation Consolidation & Area Dashboards — Design

**Date:** 2026-09-21
**Status:** Approved, not yet implemented
**Scope:** Back-office navigation only. The crew nav is deliberately untouched.

## The problem

The back-office sidebar is 25 links in one flat column across five group headings.
It is taller than the viewport — the component carries a scroll-restoration effect
written specifically to cope with that, which is the code admitting the nav is too
long. The area headings are labels only: there is nowhere to land for "Operations",
and no way to see what an area contains without scrolling past everything else.

Separately, "Performance" is the wrong name for what that page is. It is the weekly
bonus board.

## What exists today

- **`src/lib/nav.ts`** — `BACK_OFFICE_AREAS`: 6 areas (operations, people, materials,
  policies, compliance, and traction as `status: 'planned'`), 27 items total. Wildly
  uneven: Operations 9, People 12, Materials 1, Policies 2, Compliance 3.
  `NavArea { key, label, description, icon, status, items }`,
  `NavItem { title, href, description, icon, badgeKey? }`.
  `LIVE_AREAS` / `PLANNED_AREAS` are derived; planned areas appear on the hub only,
  never in the sidebar, because a nav link to a route that does not exist is a dead
  link.
- **`src/components/navigation/sidebar.tsx`** (327 lines, client) — ONE component
  serving both audiences. Crew get 5 links; back office get the hub link plus every
  area's items, flattened. Desktop is a fixed `w-64` `<aside>`; mobile is a `Sheet`
  rendering the *same* `NavContent`. Badges come from `badgeKey` against a counts map.
- **`src/app/(authenticated)/layout.tsx`** — `<main className="lg:pl-64">` with
  `pt-16 lg:pt-0` clearing the mobile bar.
- **`radix-ui` 1.4.3** (unified package) already resolves `Popover` and `HoverCard`.
  **No new dependency is needed** — add a thin wrapper in `components/ui` the way
  `dropdown-menu.tsx` already does.
- **Redirect pattern** (from the payroll consolidation) — a server page that awaits
  `searchParams` and calls `redirect()`, kept rather than deleted because people
  bookmark these.
- **`getAdminDashboard()`** already computes per-area figures: today's jobs, truck
  demand, rental gaps, headcount, in-trial, attendance rate, tardies, materials usage.
  Area dashboards reuse these rather than adding queries.

## Design

### 1. Two-level navigation (desktop)

A fixed **rail** (~72px) listing Hub plus the five live areas as icon-over-label.
Beside it, a **panel** (~224px) listing the current area's modules, grouped.

- **Hover or keyboard focus** on a rail item opens a **flyout** of that area's
  modules — so you can look into Materials without leaving Payroll.
- **Clicking** a rail item navigates to that area's dashboard; the panel then shows
  that area's modules.

**Which area is expanded is derived from the URL, not from component state.** The
area owning the current route is the expanded one. This survives refresh, the back
button and a shared link, and there is no state that can disagree with the page you
are on. (The payroll tab bar earned this lesson the hard way.)

**Width is constant, not dynamic: 296px** (72 + 224) for back office, and the crew
nav stays at 256px. A panel that appears and disappears would shift the whole page
sideways on navigation. The cost is ~40px more chrome than today; the benefit is no
layout jump, and `lg:pl-[18.5rem]` stays a constant the layout can set without
knowing the pathname — which a server layout cannot reliably do anyway.

**Prefix matching** decides the active area: match each item `href` against the
pathname and take the LONGEST match, so `/admin/compliance/items` resolves to
Compliance Items and not merely Compliance.

### 2. Touch

There is no hover on touch. The mobile `Sheet` keeps one column and becomes an
accordion: tap an area to expand its modules, with the area dashboard as the first
link in the group. Same config, same data, no flyout.

Accessibility, on desktop: the flyout opens on focus as well as hover, closes on
Escape, and the rail items are real links — a hover-only menu is unusable by
keyboard and invisible to a screen reader.

### 3. Sub-grouping

Add an optional `group?: string` to `NavItem`. The panel and flyout render groups in
declaration order; an area with no groups renders a flat list. Twelve flat items is
the problem being solved, so moving twelve flat items sideways would not solve it.

**Operations** — *Daily*: Morning Meeting, Jobs, Rental Trucks, Crew Responses ·
*Revenue*: Profitability, Google Reviews, QuickBooks · *Data*: Calendar Sync,
Import Data.

**People** — *Team*: Employees, Hiring, Certifications, Pay Scale & Skills ·
*Pay*: Payroll, Weekly Bonus, Tenure Bonus, Mileage · *Performance*: Weekly
Scoreboard, Damages · *Admin*: Message Board, Admin Settings.

Materials, Policies and Compliance have 1–3 items and stay flat.

### 4. Area dashboards

`NavArea` gains an `href`.

| Area | Dashboard | Note |
|---|---|---|
| Operations | **new** `/admin/operations` | today's jobs, truck demand, rental gaps |
| People | **new** `/admin/people` | headcount, in trial, attendance, tardies |
| Materials | existing `/admin/materials` | area *is* the module |
| Policies | existing `/admin/policies` | area *is* the module |
| Compliance | existing `/admin/compliance` | already a dashboard |

Each dashboard renders a metric strip plus **module cards generated from the area's
own items**. One config edit then puts a new module in the rail flyout, the panel,
the accordion and its area dashboard — there is no fourth place to remember.

Where the area and the module are the same page (Materials, Policies, Compliance),
the rail links straight to it and the item is not listed twice.

The **People dashboard reserves a slot for the crew meeting scheduler**, which is a
separate project and a separate spec.

The existing Company Hub at `/admin` stays as the cross-cutting home.

### 5. Performance → Weekly Bonus

The route moves to `/admin/weekly-bonus`. `/admin/performance` becomes a redirect
page mirroring the payroll pattern exactly. Updated: the nav title, the page
heading, the "Performance" link in the payroll close-week controls, the
morning-meeting copy that points people at it, and the remaining references (18 in
total across the app).

## Files

| Path | Change |
|---|---|
| `src/lib/nav.ts` | `href` on `NavArea`, `group?` on `NavItem`, groups filled in, title renamed |
| `src/components/ui/popover.tsx` | **new** — thin Radix wrapper for the flyout |
| `src/components/navigation/sidebar.tsx` | split: crew nav unchanged, back office becomes rail + panel |
| `src/components/navigation/area-rail.tsx` | **new** — the rail and its flyouts |
| `src/components/navigation/area-panel.tsx` | **new** — the grouped module panel |
| `src/components/navigation/area-accordion.tsx` | **new** — the touch/Sheet variant |
| `src/lib/nav-active.ts` | **new** — longest-prefix active-area resolution, pure and testable |
| `src/app/(authenticated)/layout.tsx` | offset 256 → 296 for back office |
| `src/app/(authenticated)/admin/operations/page.tsx` | **new** dashboard |
| `src/app/(authenticated)/admin/people/page.tsx` | **new** dashboard |
| `src/components/navigation/area-dashboard.tsx` | **new** — shared dashboard body from nav config |
| `src/app/(authenticated)/admin/weekly-bonus/` | moved from `performance/` |
| `src/app/(authenticated)/admin/performance/page.tsx` | becomes a redirect |

Splitting the sidebar into focused files matters: it is already 327 lines doing two
jobs for two audiences, and this change would otherwise push it past 600.

## Edge cases

- **Crew nav must not regress.** It shares the component today; the split has to keep
  the crew path byte-identical in behaviour. Crew never see the rail.
- **Badges.** `badgeKey` counts must still render on module links, and an area whose
  child has a non-zero badge shows a dot on the rail — otherwise collapsing the nav
  hides the one thing designed to shout.
- **Planned areas** (traction) stay off the rail, as now.
- **Deep links** into a module must expand the owning area — hence longest-prefix
  matching rather than `startsWith` on the area key.
- **`/admin/materials`** is both an area and a module; dedupe so it appears once.
- **The active-link scroll effect** exists because the nav is long. Once the panel
  shows one area at a time it is dead code for back office — keep it for crew, drop
  it from the back-office path rather than leaving it to confuse the next reader.
- **The old `/admin/performance` URL** must keep working; it is linked from payroll.

## Verification

No test framework in this repo (no vitest/jest/playwright; scripts are
`dev`/`build`/`start`/`lint`). So: `tsc --noEmit`, `eslint`, `npm run build`, then
manual QA:

1. Hover a rail area → flyout lists its modules, grouped.
2. Click it → lands on the area dashboard, panel shows that area.
3. Deep-link to `/admin/compliance/items` → Compliance expanded, correct item active.
4. Tab to a rail item → flyout opens on focus; Escape closes it.
5. Phone width → accordion, no flyout, every module reachable.
6. Sign in as crew → nav identical to today.
7. A module with a badge → count on the link, dot on the rail.
8. Visit `/admin/performance` → redirects to `/admin/weekly-bonus`.

`nav-active.ts` is pure so the prefix-matching rule can be tested later without
restructuring; adding vitest was offered earlier and deferred.

## Out of scope

The crew meeting scheduler (its own spec, landing in the People area), the traction
area, any crew-side navigation change, and re-theming — this is structure, not a
visual redesign.
