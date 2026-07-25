-- Refinements from the Attendance & Weekly Bonus Policy (PDF):
--  - Expanded strike list (call-out, tools, uniform, arrival window, non-compliance).
--  - Automatic weekly role bonuses: Drivers +0.25, 2-Truck Leads +0.25.
--  - Perfect Week is dropped as a positive (not in the final policy).

ALTER TABLE bonus_strikes DROP CONSTRAINT IF EXISTS bonus_strikes_type_check;
ALTER TABLE bonus_strikes ADD CONSTRAINT bonus_strikes_type_check
  CHECK (type IN (
    'LATE', 'NO_SHOW', 'TRUCK_NOT_READY',
    'CALL_OUT', 'TOOLS', 'UNIFORM', 'ARRIVAL_WINDOW', 'NON_COMPLIANCE'
  ));

INSERT INTO app_settings (key, value) VALUES
  ('bonus_driver_weekly', '0.25'),
  ('bonus_truck_lead_weekly', '0.25')
ON CONFLICT (key) DO NOTHING;

-- Missing pay-scale skill from the policy (tenure with GG).
INSERT INTO skills (name, raise_amount, sort_order, active)
SELECT 'Years with GG', 1.00, COALESCE((SELECT MAX(sort_order) FROM skills), 0) + 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM skills WHERE name = 'Years with GG');
