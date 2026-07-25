-- Manual monthly operating costs for the Profitability / P&L tab: overhead, debt
-- service, and owner/admin salaries that aren't captured elsewhere. Each row is one
-- line item for one month. QuickBooks can auto-populate these later.
CREATE TABLE IF NOT EXISTS operating_costs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_month DATE NOT NULL,                 -- first day of the month
  category     TEXT NOT NULL CHECK (category IN ('overhead', 'debt', 'salary', 'other')),
  label        TEXT NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operating_costs_month ON operating_costs(period_month);
