-- GoodGuys Dashboard Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'driver', 'lead', 'helper')),
  start_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  revenue DECIMAL(10, 2),
  crew_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checklist completions
CREATE TABLE IF NOT EXISTS checklist_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('driver', 'lead', 'helper')),
  items_completed TEXT[] DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  arrival_time TIME,
  is_tardy BOOLEAN DEFAULT false,
  in_uniform BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- Perfect weeks
CREATE TABLE IF NOT EXISTS perfect_weeks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  achieved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, week_start)
);

-- Mileage entries
CREATE TABLE IF NOT EXISTS mileage_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  miles DECIMAL(10, 2) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Damages
CREATE TABLE IF NOT EXISTS damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  employee_ids UUID[] DEFAULT '{}',
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  was_reported BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance events
CREATE TABLE IF NOT EXISTS performance_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('five_star_review', 'customer_callout', 'crew_callout')),
  description TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly bonuses
CREATE TABLE IF NOT EXISTS monthly_bonuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  total_revenue DECIMAL(12, 2) NOT NULL,
  pool_percentage DECIMAL(5, 2) NOT NULL,
  total_pool DECIMAL(12, 2) NOT NULL,
  damages_deducted DECIMAL(12, 2) DEFAULT 0,
  tenure_pool DECIMAL(12, 2) NOT NULL,
  performance_pool DECIMAL(12, 2) NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- Bonus payouts
CREATE TABLE IF NOT EXISTS bonus_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monthly_bonus_id UUID REFERENCES monthly_bonuses(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  tenure_shares INTEGER DEFAULT 0,
  tenure_amount DECIMAL(10, 2) DEFAULT 0,
  performance_score INTEGER DEFAULT 0,
  performance_amount DECIMAL(10, 2) DEFAULT 0,
  mileage_amount DECIMAL(10, 2) DEFAULT 0,
  perfect_week_hours INTEGER DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  UNIQUE(monthly_bonus_id, employee_id)
);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfect_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_payouts ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employees
    WHERE email = auth.jwt() ->> 'email'
    AND (is_admin = true OR role IN ('owner', 'manager'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get current employee ID
CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM employees
    WHERE email = auth.jwt() ->> 'email'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Employees policies
CREATE POLICY "Admins can do everything with employees" ON employees
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own employee record" ON employees
  FOR SELECT USING (email = auth.jwt() ->> 'email');

-- Jobs policies
CREATE POLICY "Admins can do everything with jobs" ON jobs
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view jobs they're assigned to" ON jobs
  FOR SELECT USING (current_employee_id() = ANY(crew_ids) OR is_admin());

-- Checklist completions policies
CREATE POLICY "Admins can do everything with checklists" ON checklist_completions
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view and create their own checklists" ON checklist_completions
  FOR ALL USING (employee_id = current_employee_id());

-- Attendance policies
CREATE POLICY "Admins can do everything with attendance" ON attendance
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own attendance" ON attendance
  FOR SELECT USING (employee_id = current_employee_id());

-- Perfect weeks policies
CREATE POLICY "Admins can do everything with perfect_weeks" ON perfect_weeks
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own perfect_weeks" ON perfect_weeks
  FOR SELECT USING (employee_id = current_employee_id());

-- Mileage policies
CREATE POLICY "Admins can do everything with mileage" ON mileage_entries
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own mileage" ON mileage_entries
  FOR SELECT USING (employee_id = current_employee_id());

-- Damages policies
CREATE POLICY "Admins can do everything with damages" ON damages
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view damages they're involved in" ON damages
  FOR SELECT USING (current_employee_id() = ANY(employee_ids) OR is_admin());

-- Performance events policies
CREATE POLICY "Admins can do everything with performance" ON performance_events
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own performance" ON performance_events
  FOR SELECT USING (employee_id = current_employee_id());

-- Monthly bonuses policies
CREATE POLICY "Admins can do everything with bonuses" ON monthly_bonuses
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view monthly bonuses" ON monthly_bonuses
  FOR SELECT USING (true);

-- Bonus payouts policies
CREATE POLICY "Admins can do everything with payouts" ON bonus_payouts
  FOR ALL USING (is_admin());

CREATE POLICY "Users can view their own payouts" ON bonus_payouts
  FOR SELECT USING (employee_id = current_employee_id());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_checklist_job ON checklist_completions(job_id);
CREATE INDEX IF NOT EXISTS idx_checklist_employee ON checklist_completions(employee_id);
CREATE INDEX IF NOT EXISTS idx_mileage_employee_date ON mileage_entries(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_performance_employee_date ON performance_events(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_bonus_month_year ON monthly_bonuses(month, year);
