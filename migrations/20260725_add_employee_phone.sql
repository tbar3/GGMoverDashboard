-- Phone number for the crew (shown in the Employees table, used for dispatch).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
