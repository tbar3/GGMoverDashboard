-- Hiring / interview scorecard module
--
-- Ports the standalone goodguys-interview-scorecard HTML tool into the hub so
-- completed scorecards are stored against a candidate instead of living as
-- loose PDFs. Back office only.
--
-- Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  position TEXT NOT NULL CHECK (position IN
    ('mover_helper', 'driver', 'cdl_driver', 'crew_lead')),
  referred_by TEXT,
  status TEXT NOT NULL DEFAULT 'interviewed' CHECK (status IN
    ('interviewed', 'advance', 'maybe', 'pass', 'hired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_scorecards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- Who ran it. interviewer_id is null when the interviewer isn't an employee
  -- row yet; interviewer_name is always captured so the record stands alone.
  interviewer_id UUID REFERENCES employees(id),
  interviewer_name TEXT NOT NULL,
  interview_date DATE NOT NULL,

  -- Denormalised for list views and candidate comparison without parsing JSON.
  -- 9 scored questions (6 core values + 3 theoreticals), 1-5 each, max 45.
  total_score INTEGER NOT NULL DEFAULT 0,
  scored_count INTEGER NOT NULL DEFAULT 0,
  fit_band TEXT CHECK (fit_band IN
    ('strong_fit', 'solid', 'borderline', 'not_a_fit')),
  recommendation TEXT CHECK (recommendation IN ('advance', 'maybe', 'pass')),

  -- Everything else: per-question scores and notes, the section 1-2 pill
  -- selections and free-text, and the policy-walkthrough checkboxes. Kept as
  -- JSONB because the question set is content that will change over time, and
  -- a column per field would mean a migration every time a question is reworded.
  responses JSONB NOT NULL DEFAULT '{}',
  final_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_position ON candidates(position);
CREATE INDEX IF NOT EXISTS idx_scorecards_candidate ON interview_scorecards(candidate_id);
CREATE INDEX IF NOT EXISTS idx_scorecards_date ON interview_scorecards(interview_date DESC);
