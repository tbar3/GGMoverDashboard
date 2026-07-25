-- Certifications: the process of earning a skill. A skill (from the skills table)
-- gets practice REQUIREMENTS (milestones a candidate logs toward) and one or more
-- multi-question crew-vote SURVEYS. Admin reviews progress + survey results, then
-- grants the skill (existing employee_skills) to certify. Reuses skills + employees.

-- Practice milestones per skill, e.g. "Designated stacker" target 5.
CREATE TABLE IF NOT EXISTS certification_requirements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id     UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cert_requirements_skill ON certification_requirements(skill_id);

-- One logged occurrence of a candidate practicing toward a requirement.
CREATE TABLE IF NOT EXISTS practice_entries (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id       UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES certification_requirements(id) ON DELETE CASCADE,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  note           TEXT,
  logged_by      UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_practice_emp_skill ON practice_entries(employee_id, skill_id);

-- A crew-vote survey attached to a skill (editable/added/deleted by admin).
CREATE TABLE IF NOT EXISTS certification_surveys (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id   UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cert_surveys_skill ON certification_surveys(skill_id);

-- The configurable questions on a survey.
CREATE TABLE IF NOT EXISTS survey_questions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id  UUID NOT NULL REFERENCES certification_surveys(id) ON DELETE CASCADE,
  prompt     TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'rating' CHECK (type IN ('rating', 'yes_no', 'text')),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id);

-- One crew member's response for a candidate (one per voter per survey per candidate).
CREATE TABLE IF NOT EXISTS survey_responses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id    UUID NOT NULL REFERENCES certification_surveys(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  voter_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, candidate_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_lookup ON survey_responses(survey_id, candidate_id);

CREATE TABLE IF NOT EXISTS survey_answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  rating      INTEGER,
  bool_value  BOOLEAN,
  text_value  TEXT
);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response ON survey_answers(response_id);
