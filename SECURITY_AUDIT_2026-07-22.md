# Security Audit — GoodGuys Hub (GGEmployeeDashboard)

**Date:** 2026-07-22
**Scope:** Role-based authorization across API routes and back-office pages.
**Verdict:** The app authenticates (checks *are you logged in*) but does **not** authorize
(check *are you allowed*). Any crew member with a login can read company-wide financial and
personnel data. This is exploitable today with nothing more than a phone browser.

---

## 🔴 Critical (exploitable now)

### C1 — No role check on ANY API route (17 of 17)
Every route in `src/app/api/**` gates on `if (!user)` only. None check `role` or `is_admin`.
Concretely reachable by any authenticated crew member:

- **`src/app/api/employees/route.ts:5`** — `GET` returns **all employees** incl. `role` and `hourly_rate`.
- **`src/app/api/payroll/route.ts:5`** — `GET` with no `employee_id` param returns **everyone's payroll** (joined to names/roles).
- **`src/app/api/bonus-data/route.ts`** — `GET` returns company bonus data.
- **`src/app/api/attendance/route.ts:31`** — `GET` with no params returns **all attendance** for all staff.
- **`src/app/api/import/route.ts`** — `POST` allows **bulk data import** with no role gate (write access).
- **`src/app/api/jobs/[id]/route.ts`** — `PATCH` edits **any job** with no role gate.

**Impact:** wage data, damage/discipline records, and the full employee roster leak to any crew login;
write endpoints allow tampering.
**Fix:** central `requireBackOffice()` guard at the top of every back-office route; crew-facing routes
scoped to the caller (see H1).

### C2 — Back-office pages reachable by crew (no choke point)
There is **no `src/app/(authenticated)/admin/layout.tsx`**, so nothing guards the admin tree as a whole.
`src/app/(authenticated)/admin/page.tsx:11` only does `if (!user) return null;` — the admin dashboard
(company payroll/damage/mileage totals) renders for **any** logged-in user. Same gap on
`admin/bonus`, `admin/calendar`, `admin/damages`, `admin/mileage`, `admin/performance`.

**Impact:** crew who type `/admin` see company financials. The sidebar hides the link, but the route is live.
**Fix:** add `admin/layout.tsx` that loads the employee and `redirect('/crew')` unless back-office role.

### C3 — Middleware is role-blind
`src/middleware.ts` calls `auth.protect()` for `/admin(.*)` — that only enforces *logged in*, not role.
**Fix:** in middleware, resolve role and block back-office route patterns for crew (defense-in-depth layer 1).

---

## 🟡 High (exposes risk)

### H1 — IDOR on crew-facing endpoints
Crew endpoints (`payroll`, `attendance`, `mileage`, `checklists`, `performance-events`) accept an
`employee_id` **query param** and return that person's data without verifying it equals the caller's own
employee id. Even after C1 is fixed, a crew member could pass a coworker's id.
**Fix:** derive the caller's `employee_id` from the session; for crew, ignore any client-supplied id.

### H2 — No input validation on write routes
`POST`/`PATCH` handlers trust the shape of `request.json()` (no Zod). Combined with C1 this widens the blast radius.
**Fix:** validate bodies with Zod at each write route.

### H3 — Dependency vulnerabilities
`npm audit`: 2 critical, 15 high. Needs triage (some may be transitive/build-only).
**Fix:** `npm audit` review; upgrade the exploitable ones.

---

## 🟢 Best practice (hardening)
- Centralize the role check in one `lib/auth.ts` helper rather than repeating it per route.
- Add a crew-only surface (`/crew`) so crew never render back-office code at all.

## ✅ What looked good
- `.env.local` is gitignored; no secret patterns in git history.
- All SQL is parameterized — no string-interpolated queries, no injection surface found.
- No `dangerouslySetInnerHTML`.
- Clerk keys are `pk_test_` locally (confirm Vercel prod uses `pk_live_`).

## Not checked (out of scope)
- Live/penetration testing (static audit only).
- The separate `gg-materials-management` app.
- Clerk production dashboard config, rate limiting, session lifetimes.

---

*This audit covers common failure modes for this stack. It is not a compliance certification or a
substitute for professional penetration testing.*
