-- GoodGuys Dashboard Database Schema for Neon Postgres
-- Run this against your Neon database

-- Create schema
CREATE SCHEMA IF NOT EXISTS mover_dashboard;
SET search_path TO mover_dashboard;

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
  -- Calendar sync fields
  calendar_event_id TEXT UNIQUE,
  job_number TEXT,
  service_type TEXT,
  start_time TEXT,
  end_time TEXT,
  branch TEXT,
  job_details TEXT,
  pricing_type TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  lead_source TEXT,
  estimated_hours DECIMAL(4, 1),
  volume_cuft DECIMAL(10, 2),
  weight_lbs DECIMAL(10, 2),
  arrival_window TEXT,
  property_type TEXT,
  dispatch_notes TEXT,
  internal_notes TEXT,
  crew_notes TEXT,
  customer_notes TEXT,
  quoted_trucks INTEGER,
  quoted_crew INTEGER,
  truck_name TEXT,
  crew_manifest JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Google tokens storage
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, employee_id)
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
