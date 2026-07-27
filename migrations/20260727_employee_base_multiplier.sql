-- Per-employee base bonus multiplier override. NULL = use the company-wide
-- default (app_settings 'bonus_base_multiplier'). Driver / 2-Truck Lead add-ons
-- (+0.25 each, from skills) stack on top of this base.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_multiplier NUMERIC(4, 2);
