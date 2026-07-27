-- Lateness tracking: record the scheduled start each person was due (default the
-- 7:15 AM warehouse call, editable per row) and the minutes they were late, so
-- late time can be docked from pay. late_minutes = max(0, arrival - scheduled_start).

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS scheduled_start TIME NOT NULL DEFAULT '07:15',
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0;
