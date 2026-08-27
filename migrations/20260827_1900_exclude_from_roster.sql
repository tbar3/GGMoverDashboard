-- Portal-only accounts. Several people have two active employee rows: a crew record
-- under their personal email that carries the payroll and bonus history, and a
-- second @goodguysserve.com row (is_admin, owner/manager) that exists purely as
-- their admin-portal login.
--
-- Those login rows should not appear on the Employees roster — they aren't separate
-- people. They CANNOT simply be deactivated: getCurrentEmployee() resolves the
-- signed-in Clerk user by email, and requireEmployee() rejects is_active = FALSE, so
-- deactivating them would lock those people out of the portal entirely.
--
-- Hence a separate flag that is purely presentational. Nothing in the auth path
-- reads it, so hiding someone from the roster can never affect their access.
--
-- Additive, idempotent. Defaults FALSE so every existing row keeps showing.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS exclude_from_roster BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN employees.exclude_from_roster IS
  'TRUE = a portal login account, not a roster person: hidden from the Employees list. Presentational only — never consulted for authentication or authorization.';
